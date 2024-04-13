const mongoose = require('mongoose');
const schema = mongoose.Schema;

const userSchema = new schema({
    fullName:{
        type: String,
        required: true
    },
    email:{
        type: String,
        required: true,
        unique: true
    },
    password:{
        type: String,
        required: true
    }
});

const userModel = mongoose.model('users', userSchema);
module.exports = userModel;