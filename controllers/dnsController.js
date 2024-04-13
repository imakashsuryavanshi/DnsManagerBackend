const dnsModel = require('../models/dnsModel');
const mongoose = require('mongoose');

const csv = require("csv-parser");
const fs = require("fs");

const AWS = require("../config/awsConfig");

// Create a new Route 53 object
const route53 = new AWS.Route53();

//Creating Record
module.exports = {
  listDns: async (req, res) => {
    const { user } = req.query;
    try {
      // Fetch DNS records belonging to the authenticated user
      const records = await dnsModel.find({ user: user });
      res.json(records);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
  getFilteredRecords: async(req, res) =>{
    try {
      // Extract filter parameters from the request query
      const { filter, value } = req.query;
       console.log(filter +  " " + value);
      // Perform filtering based on the specified criteria
      let filteredRecords;
      if (filter && value) {
        // Query the database based on the filter and value
        filteredRecords = await dnsModel.find({ [filter]: value });
      } else {
        // If no filter parameters provided, return all DNS records
        filteredRecords = await dnsModel.find();
      }
  
      // Return filtered data as response
      res.status(200).json({ success: true, data: filteredRecords });
    } catch (error) {
      // Handle errors
      console.error('Error filtering DNS records:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  },
  getDataDistribution: async(req, res) =>{
    try {
      // Extract parameter for data distribution from the request query
      const { parameter } = req.query;
  
      // Check if parameter is provided
      if (!parameter) {
        return res.status(400).json({ success: false, message: 'Parameter for data distribution is required' });
      }
  
      // Construct the aggregation pipeline to calculate data distribution based on the provided parameter
      const distributionPipeline = [
        { $group: { _id: '$' + parameter, count: { $sum: 1 } } } // Group and count records based on the parameter
      ];
      const distribution = await dnsModel.aggregate(distributionPipeline);
  
      // Return data distribution as response
      res.status(200).json({ success: true, distribution: distribution });
    } catch (error) {
      // Handle errors
      console.error('Error fetching data distribution:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  },
  createDns: async (req, res) => {
    const { domain, type, value, ttl, user } = req.body;

    try {
      // Check if DNS record already exists in MongoDB
      const existingRecord = await dnsModel.findOne({ domain });

      if (existingRecord) {
        return res.status(400).json({ message: 'DNS record already exists for this domain' });
      }

      // Create new DNS record in MongoDB
      const newRecord = new dnsModel({
        domain,
        type,
        value,
        ttl,
        user
      });

      await newRecord.save();

      // Create DNS record in Route 53
      const route53Response = await route53.changeResourceRecordSets({
        HostedZoneId: process.env.HOSTED_ZONE_ID,
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
        }
      }).promise();

      // Check if the Route 53 operation was successful
      if (route53Response.ChangeInfo.Status === 'PENDING') {
        return res.status(200).json(newRecord);
      } else {
        // If Route 53 operation failed, delete the newly created record from MongoDB
        await newRecord.delete();
        return res.status(500).json({ message: 'Failed to create DNS record in Route 53' });
      }
    } catch (error) {
      console.error('Error occurred during DNS record creation:', error);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  },
  updateDns: async (req, res) => {
    const { domain, type, value, ttl, user } = req.body;
    try {
      // Construct parameters for updating DNS record in Route 53
      const params = {
        ChangeBatch: {
          Changes: [
            {
              Action: "UPSERT", // Update existing record or create if not exists
              ResourceRecordSet: {
                Name: domain,
                Type: type,
                TTL: ttl,
                ResourceRecords: [{ Value: value }],
              },
            },
          ],
        },
        HostedZoneId: process.env.HOSTED_ZONE_ID,
      };

      // Call the Route 53 API to update the DNS record
      const route53Response = await route53.changeResourceRecordSets(params).promise();

      // Check the status of the Route 53 operation
      if (route53Response.ChangeInfo.Status === 'PENDING') {
        // If the status is PENDING, it means the record is either updated or inserted
        // Check if the record exists in MongoDB based on domain and type
        const existingRecord = await dnsModel.findOne({ domain, type, user });

        if (existingRecord) {
          // If record exists in MongoDB, update it
          const updatedRecord = await dnsModel.findOneAndUpdate(
            { _id: existingRecord._id }, // Update the existing record
            req.body,
            { new: true }
          );

          // Return the updated record from MongoDB
          return res.json({ message: 'DNS record updated successfully', record: updatedRecord });
        } else {
          // If record doesn't exist in MongoDB, insert a new record
          const newRecord = new dnsModel({
            domain,
            type,
            value,
            ttl,
            user: req.body.user
          });

          // Save the new record in MongoDB
          const savedRecord = await newRecord.save();

          // Return the newly inserted record
          return res.json({ message: 'DNS record inserted successfully', record: savedRecord });
        }
      } else {
        // If the status is not PENDING, handle the error accordingly
        return res.status(500).json({ message: 'Failed to update DNS record in Route 53' });
      }
    } catch (err) {
      res.status(400).json({ message: err.message });
    }
  },
  deleteDns: async (req, res) => {
    const { id } = req.query;
    try {
      // Construct parameters for deleting DNS record in Route 53
      const recordToDelete = await dnsModel.findById(id); // Find the record to delete
      console.log(recordToDelete);
      console.log(id);
      const params = {
        ChangeBatch: {
          Changes: [
            {
              Action: "DELETE", // Delete the existing record
              ResourceRecordSet: {
                Name: recordToDelete.domain, // Use the domain name of the record to delete
                Type: recordToDelete.type, // Use the record type of the record to delete
                TTL: recordToDelete.ttl, // Use the TTL of the record to delete
                ResourceRecords: [{ Value: recordToDelete.value }], // Specify the resource record value
              },
            },
          ],
        },
        HostedZoneId: process.env.HOSTED_ZONE_ID,
      };

      // Call the Route 53 API to delete the DNS record
      const route53Response = await route53.changeResourceRecordSets(params).promise();

      // Check the status of the Route 53 operation
      if (route53Response.ChangeInfo.Status === 'PENDING') {
        // Find the record in MongoDB and delete it
        await dnsModel.findOneAndDelete({ _id: id }); // Ensure record belongs to the authenticated user
        return res.json({ message: "Record deleted" });
      } else {
        // If the status is not PENDING, handle the error accordingly
        return res.status(500).json({ message: 'Failed to delete DNS record in Route 53' });
      }
    } catch (err) {
      res.status(500).json({ errormessage: err.message });
    }
  },
  bulkUpload: async (req, res) => {  
    console.log(req.file);
    try {
      // Ensure the request contains a file
      if (!req.file) {
        return res.status(400).json({ message: "No files were uploaded" });
      }

      // Ensure the uploaded file is a CSV file
      if (req.file.mimetype !== "text/csv") {
        return res.status(400).json({ message: "Only CSV files are allowed" });
      }

      // Read and process the CSV file
      const records = [];
      await new Promise((resolve, reject) => {
        fs.createReadStream(req.file.path)
          .pipe(csv())
          .on("data", (data) => {
            // Construct a new DNS record object from CSV data
            const record = new dnsModel({
              domain: data.domain,
              type: data.type,
              value: data.value,
              ttl: data.ttl,
              user: data.user, // Associate the record with the authenticated user
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

      // Create arrays to store successful and failed records
      const successfulRecords = [];
      const failedRecords = [];

      // Call the Route 53 API to create DNS records
      await Promise.all(records.map(async (record) => {
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
          HostedZoneId: process.env.HOSTED_ZONE_ID,
        };

        try {
          // Attempt to add record to Route 53
          await route53.changeResourceRecordSets(params).promise();
          // If successful, add record to successfulRecords array
          successfulRecords.push(record);
        } catch (error) {
          // If failed, add record to failedRecords array
          //console.error("Error creating DNS record in Route 53:", error);
          failedRecords.push(record);
        }
      }));

      // Save successful records to the database
      await dnsModel.insertMany(successfulRecords);

      // Remove the temporary file after processing
      fs.unlinkSync(req.file.path);

      // Return response with information about successful and failed records
      res.status(200).json({
        message: "Bulk upload successful",
        successfulRecords: successfulRecords,
        failedRecords: failedRecords
      });
    } catch (error) {
      console.error("Error uploading CSV file:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }

}
