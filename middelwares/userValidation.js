const joi = require("joi");

const registeredUsersValidation = (req, res, next) => {
    const schema = joi.object({
        fullName: joi.string().min(3).max(50).required(),
        email: joi.string().email().required(),
        password: joi.string().min(4).alphanum().required()
    });
    const {error, value} = schema.validate(req.body);
    if(error){
        return res.status(400).json({message:"Bad request", error})
    }
    next();
}

const loginUsersValidation  = (req, res, next) => {
    const schema = joi.object({
        email: joi.string().email().required(),
        password: joi.string().min(4).required()
    });
    const {error, value} = schema.validate(req.body);
    if(error){
        return res.status(400).json({message:"Bad request", error})
    }
    next();
}

module.exports = {
    registeredUsersValidation,
    loginUsersValidation
}