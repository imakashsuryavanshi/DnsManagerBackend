const userModel = require("../models/userModel");
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

module.exports = {

    registerUser: async (req,res)=>{
        const user = new userModel(req.body);
        user.password = await bcrypt.hash(req.body.password, 10);
        try{
            const response = await user.save();
            response.password = undefined;
            return res.status(201).json({message:'success', data: response});
        }
        catch(error){
            return res.status(500).json({message:'Error occured', error});
        }
    },
    loginUser:async (req,res)=>{
        try{
            const user = await userModel.findOne({email: req.body.email});
            if(!user){
                return res.status(401).json({message:'Authentication failed, Invalid username/password'});
            }

            const isPasswordEqual = await bcrypt.compare(req.body.password, user.password);
            if(!isPasswordEqual){
                return res.status(401)
                .json({message:'Authentication failed, Invalid username/password'});
            }
            const tokenOject = {
               id: user.id,
               fullName: user.fullName,
               email: user.email
            }
            const jwtToken = jwt.sign(tokenOject, process.env.JWTSECRET, {expiresIn: '1h'});
            return res.status(200).json({jwtToken, tokenOject});
        }
        catch(error){
            return res.status(500).json({message:'Error occured', error});
        }
    },
    getUsers:async (req,res)=>{
        try{
            const users = await userModel.find({}, {password: 0});
            return res.status(200).json({data: users});
        }catch(error){
            return res.status(500)
            .json({message: 'Error occured while retriving users', error});
        }

    }
}