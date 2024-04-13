const mongoose = require('mongoose');
const schema = mongoose.Schema;

const dnsSchema = new schema({
    domain: {
        type: String,
        required: true
      },
      type: {
        type: String,
        enum: ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'PTR', 'SOA', 'SRV', 'TXT', 'DNSSEC'],
        required: true
      },
      value: {
        type: String,
        required: true
      },
      ttl: {
        type: Number,
        default: 3600 // Default TTL (Time to Live) in seconds
      },
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users',
        required: true
      }
});

const dnsModel = mongoose.model('dnss', dnsSchema);
module.exports = dnsModel;