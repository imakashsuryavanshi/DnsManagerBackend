require('dotenv').config();
const AWS = require('aws-sdk');

const awsConfig = {
    AWS_SDK_LOAD_CONFIG: process.env.AWS_SDK_LOAD_CONFIG,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION
};

// Update AWS SDK configuration
AWS.config.update(awsConfig);

module.exports = AWS;