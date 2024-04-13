const mongoose = require('mongoose');
const uri = process.env.ATLAS_URI || ""

mongoose.connect(uri)
.then(()=>{
    console.log('Database connected successfully!!');
}).catch((error)=>{
    console.log('Error while connecting to Database : ', error);
    console.log('Url : ', uri);
})