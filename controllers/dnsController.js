const dnsModel = require('../models/dnsModel');
const mongoose = require('mongoose');
const csv = require("csv-parser");
const fs = require("fs");
const AWS = require("../config/awsConfig");
const route53 = new AWS.Route53();

async function addSubdomain(domain, hostedZoneId, type, ttl, value, user, req, res) {
  const params = {
    ChangeBatch: {
      Changes: [{
        Action: 'CREATE',
        ResourceRecordSet: {
          Name: domain,
          Type: type,
          TTL: ttl,
          ResourceRecords: [{ Value: value }]
        }
      }]
    },
    HostedZoneId: hostedZoneId,
  };

  try {
    const data = await route53.changeResourceRecordSets(params).promise();
    // // Delete the previous record from the database
    // await dnsModel.findOneAndDelete({ _id: req.body._id });
    // Create and save the new record
    const newRecord = new dnsModel({
      domain,
      type,
      value,
      ttl,
      user
    });
    await newRecord.save();
    console.log('Subdomain added successfully:', data);
    return res.status(200).json(newRecord);
  } catch (err) {
    console.error('Error adding subdomain:', err);
    return res.status(500).json({ message: 'Failed to add subdomain' });
  }
}

async function updateSubdomain(domain, hostedZoneId, type, value, ttl, req, res) {
  try {
    // Construct parameters for updating DNS record in Route 53
    const params = {
      ChangeBatch: {
        Changes: [
          {
            Action: "UPSERT",
            ResourceRecordSet: {
              Name: domain,
              Type: type,
              TTL: ttl,
              ResourceRecords: [{ Value: value }],
            },
          },
        ],
      },
      HostedZoneId: hostedZoneId,
    };

    // Call the Route 53 API to update the DNS record
    const route53Response = await route53.changeResourceRecordSets(params).promise();

    // Check the status of the Route 53 operation
    if (route53Response.ChangeInfo.Status === 'PENDING') {
      console.log(`Subdomain ${domain} updated successfully`);
      // Update the record in the database
      const updatedRecord = await dnsModel.findOneAndUpdate({ domain }, { type, value, ttl }, { new: true });

      if (updatedRecord) {
        return res.status(200).json({ message: `Subdomain ${domain} updated successfully` });
      } else {
        return res.status(400).json({ message: `Failed to update DNS record in the database for ${domain}` });
      }

    } else {
      return res.status(400).json({ message: 'Failed to update DNS record in Route 53' });
    }
  } catch (err) {
    console.error('Error updating subdomain:', err);
    return res.status(500).json({ message: `Error updating subdomain ${domain}: ${err.message}` });
  }
}

async function deleteExistingRecord(recordId, req, res) {
  try {
    // Retrieve the existing record from the database
    const existingRecord = await dnsModel.findById(recordId);
    if (!existingRecord) {
      console.error('Record not found in the database');
      return;
    }

    // Retrieve the hosted zone ID from AWS Route 53
    const domain = extractDomain(existingRecord.domain);
    const hostedZoneId = await getHostedZoneId(domain);
    if (!hostedZoneId) {
      console.error('Hosted zone ID not found for the domain');
      return;
    }

    // Construct parameters for deleting DNS record in Route 53
    const deleteParams = {
      ChangeBatch: {
        Changes: [{
          Action: 'DELETE',
          ResourceRecordSet: {
            Name: existingRecord.domain,
            Type: existingRecord.type,
            TTL: existingRecord.ttl,
            ResourceRecords: [{ Value: existingRecord.value }]
          }
        }]
      },
      HostedZoneId: hostedZoneId
    };

    // Delete the record from AWS Route 53
    const data = await route53.changeResourceRecordSets(deleteParams).promise();
    console.log('Record deleted from AWS Route 53:', data);

    // Delete the record from the database
    await dnsModel.findByIdAndDelete(recordId);
    console.log('Dns Record deleted from DB');
  } catch (err) {
    console.error('Error deleting existing record:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}


async function createMainDomain(domain, type, ttl, value, user, req, res) {
  const params = {
    CallerReference: `${Date.now()}`,
    Name: domain,
    HostedZoneConfig: {
      Comment: 'Main DNS domain hosted zone',
      PrivateZone: false
    }
  };

  try {
    const data = await route53.createHostedZone(params).promise();
    await addSubdomain(domain, data.HostedZone.Id, type, ttl, value, user, req, res);
    console.log('Main domain hosted zone created successfully:', data);
    return data;
  } catch (err) {
    console.error('Error creating hosted zone:', err);
    throw err;
  }
}

async function getHostedZoneId(domain) {
  const data = await route53.listHostedZonesByName({ DNSName: domain }).promise();
  const hostedZone = data.HostedZones.find(zone => zone.Name === `${domain}.`);
  return hostedZone ? hostedZone.Id : null;
}

function extractDomain(fullDomain) {
  // Extract the domain name from the full domain (e.g., example.com from sub.example.com)
  const parts = fullDomain.split('.');
  return parts.slice(-2).join('.');
}


module.exports = {
  listDns: async (req, res) => {
    const { user } = req.query;
    try {
      const records = await dnsModel.find({ user: user });
      res.json(records);
    } catch (err) {
      res.status(500).json({ message: 'Failed to fetch DNS records' });
    }
  },

  getFilteredRecords: async (req, res) => {
    try {
      const { filter, value } = req.query;
      let filteredRecords;
      if (filter && value) {
        filteredRecords = await dnsModel.find({ [filter]: value });
      } else {
        filteredRecords = await dnsModel.find();
      }
      res.status(200).json({ success: true, data: filteredRecords });
    } catch (error) {
      console.error('Error filtering DNS records:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  },

  getDataDistribution: async (req, res) => {
    try {
      const { parameter } = req.query;
      if (!parameter) {
        return res.status(400).json({ success: false, message: 'Parameter for data distribution is required' });
      }
      const distributionPipeline = [
        { $group: { _id: '$' + parameter, count: { $sum: 1 } } }
      ];
      const distribution = await dnsModel.aggregate(distributionPipeline);
      res.status(200).json({ success: true, distribution: distribution });
    } catch (error) {
      console.error('Error fetching data distribution:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  },

  createDns: async (req, res) => {
    const { domain, type, value, ttl, user } = req.body;
    try {
      const existingRecord = await dnsModel.findOne({ domain });
      if (existingRecord) {
        return res.status(400).json({ message: 'DNS record already exists for this domain' });
      }
      const parts = domain.split('.');
      const mainDomain = parts.slice(-2).join('.');
      const data = await route53.listHostedZones({}).promise();
      const hostedZone = data.HostedZones.find(zone => zone.Name === `${mainDomain}.`);
      if (hostedZone) {
        console.log(`Main domain ${mainDomain} exists. Adding subdomain ${domain}`);
        await addSubdomain(domain, hostedZone.Id, type, ttl, value, user, req, res);
      } else {
        console.log(`Main domain ${mainDomain} doesn't exist. Creating main domain and adding subdomain ${domain}`);
        await createMainDomain(domain, type, ttl, value, user, req, res);
      }
    } catch (error) {
      console.error('Error occurred during DNS record creation:', error);
      return res.status(500).json({ message: 'Failed to create DNS record' });
    }
  },

  updateDns: async (req, res) => {
    const { domain, type, value, ttl, user } = req.body;
    const recordId = req.body._id;
    console.log(req.body._id);
    try {
      const parts = domain.split('.');
      const mainDomain = parts.slice(-2).join('.');
      const data = await route53.listHostedZonesByName({ DNSName: mainDomain }).promise();
      const hostedZone = data.HostedZones.find(zone => zone.Name === `${mainDomain}.`);
      if (hostedZone) {
        console.log(`Main domain ${mainDomain} exists.`);
        const hostedZoneId = hostedZone.Id;
        try {
          const existingRecords = await route53.listResourceRecordSets({ HostedZoneId: hostedZoneId }).promise();
          console.log(existingRecords);
          const existingRecord = existingRecords.ResourceRecordSets.find(record => record.Name === domain + '.' && record.Type === type);
          if (existingRecord) {
            console.log(`Subdomain ${domain} already exists. Updating records...`);
            await updateSubdomain(domain, hostedZoneId, type, value, ttl, req, res);
          } else {
            console.log(`Subdomain ${domain} doesn't exist. Adding subdomain...`);
            const newRecord = await addSubdomain(domain, hostedZoneId, type, ttl, value, user, req, res);
            if(newRecord){
              await deleteExistingRecord(recordId, req, res);
            }
          }
        } catch (err) {
          console.error('Error listing resource record sets:', err);
          return res.status(400).json({ message: 'Failed to update DNS records' });
        }
      } else {
        console.log(`Main domain ${mainDomain} doesn't exist. Creating main domain and adding subdomain ${domain}`);
        await createMainDomain(domain, type, ttl, value, user, req, res);
      }
    } catch (err) {
      res.status(400).json({ message: 'Failed to update DNS records' });
    }
  },

  deleteDns: async (req, res) => {
    const { id } = req.query;
    try {
      // Find the record to delete
      const recordToDelete = await dnsModel.findById(id);
      if (!recordToDelete) {
        return res.status(404).json({ message: 'DNS record not found' });
      }

      // Check if the record to delete is the main domain
      const parts = recordToDelete.domain.split('.');
      const mainDomain = parts.slice(-2).join('.');

      // If the record to delete is the main domain, check if it has associated subdomains
      if (recordToDelete.domain === mainDomain) {
        const subdomains = await dnsModel.find({ domain: { $regex: `.*${mainDomain}$` } });
        if (subdomains.length > 1) { // If there are subdomains other than the main domain itself
          return res.status(400).json({ message: 'Main domain cannot be deleted as it contains subdomains' });
        }
      }


      // Construct parameters for deleting DNS record in Route 53
      const params = {
        ChangeBatch: {
          Changes: [
            {
              Action: "DELETE",
              ResourceRecordSet: {
                Name: recordToDelete.domain.endsWith('.') ? recordToDelete.domain.slice(0, -1) : recordToDelete.domain,
                Type: recordToDelete.type,
                TTL: recordToDelete.ttl,
                ResourceRecords: [{ Value: recordToDelete.value }],
              },
            },
          ],
        },
      };

      // Retrieve the Hosted Zone ID for the domain from AWS
      const data = await route53.listHostedZonesByName({ DNSName: mainDomain }).promise();
      const hostedZone = data.HostedZones.find(zone => zone.Name === `${mainDomain}.`);
      if (!hostedZone) {
        return res.status(404).json({ message: 'Hosted zone not found for the domain' });
      }
      params.HostedZoneId = hostedZone.Id;

      // Call the Route 53 API to delete the DNS record
      const route53Response = await route53.changeResourceRecordSets(params).promise();

      // Check the status of the Route 53 operation
      if (route53Response.ChangeInfo.Status === 'PENDING') {
        // Delete the record from MongoDB
        await dnsModel.findByIdAndDelete(id);
        return res.json({ message: "DNS record deleted" });
      } else {
        return res.status(500).json({ message: 'Failed to delete DNS record in Route 53' });
      }
    } catch (err) {
      console.log(err);
      res.status(500).json({ message: err.message });
    }
  },


  bulkUpload: async (req, res) => {
    try {
      // Validate if a file was uploaded and if it's a CSV file
      if (!req.file) {
        return res.status(400).json({ message: "No files were uploaded" });
      }
      if (req.file.mimetype !== "text/csv") {
        return res.status(400).json({ message: "Only CSV files are allowed" });
      }
  
      // Read data from the uploaded CSV file
      const records = [];
      await new Promise((resolve, reject) => {
        fs.createReadStream(req.file.path)
          .pipe(csv())
          .on("data", (data) => {
            const record = new dnsModel({
              domain: data.domain,
              type: data.type,
              value: data.value,
              ttl: data.ttl,
              user: data.user,
            });
            records.push(record);
          })
          .on("end", () => {
            resolve();
          })
          .on("error", (err) => {
            reject(err);
          });
      });
  
      const successfulRecords = [];
      const failedRecords = [];
  
      // Process each record and create DNS records
      await Promise.all(records.map(async (record) => {
        try {
          console.log(record);
          const domain = extractDomain(record.domain);
          // Check if the domain already exists in any hosted zone
          let hostedZoneId = await getHostedZoneId(domain);
          if (!hostedZoneId) {
            // If domain doesn't exist, create a new hosted zone for it
              const params = {
                CallerReference: `${Date.now()}`,
                Name: domain,
                HostedZoneConfig: {
                  Comment: 'Main DNS domain hosted zone',
                  PrivateZone: false
                }
              };
            
              try {
                const data = await route53.createHostedZone(params).promise();
                console.log('Main domain hosted zone created successfully:', data);
                hostedZoneId = data.HostedZone.Id;
              } catch (err) {
                console.error('Error creating hosted zone:', err);
                throw err;
              }
          }
  
          // Construct parameters for creating DNS record in Route 53
          const params = {
            ChangeBatch: {
              Changes: [
                {
                  Action: "CREATE",
                  ResourceRecordSet: {
                    Name: record.domain,
                    Type: record.type,
                    TTL: record.ttl,
                    ResourceRecords: [{ Value: record.value }],
                  },
                },
              ],
            },
            HostedZoneId: hostedZoneId,
          };
  
          // Call the Route 53 API to create the DNS record
          await route53.changeResourceRecordSets(params).promise();
          successfulRecords.push(record);
        } catch (error) {
          failedRecords.push(record);
        }
      }));
  
      // Insert successful records into the database
      await dnsModel.insertMany(successfulRecords);
  
      // Delete the uploaded CSV file
      fs.unlinkSync(req.file.path);
  
      // Respond with the result
      res.status(200).json({
        message: "Bulk upload successful",
        successfulRecords: successfulRecords,
        failedRecords: failedRecords
      });
    } catch (error) {
      console.log(error);
    }
  },
  
};
