const express = require('express');
const dotenv = require("dotenv").config();
require('./config/db');
const authroutes = require('./routes/authRoutes');
const dnsroutes = require('./routes/dnsRoutes');
const bodyParser = require('body-parser');
var cors = require('cors');
const corsOptions ={
    origin:'http://localhost:3000', 
    credentials:true,            //access-control-allow-credentials:true
    optionSuccessStatus:200
}
const app = express();
app.use(cors());

const PORT = process.env.PORT;

app.use(bodyParser.json());
app.use('/auth', authroutes);
app.use('/dns', dnsroutes);



app.listen(PORT, ()=>{
    console.log(`Server is up and running on PORT: ${PORT}`);
})