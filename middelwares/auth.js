const jwt = require('jsonwebtoken');

const isAuthenticated = (req, res, next) =>{
    if(!req.headers['authorization']){
        return res.status(403)
        .json({message: 'Authentication Token is required'});
    }
    try{
        const decoded = jwt.verify(req.headers['authorization'], process.env.JWTSECRET);
        return next();

    }catch(err){
        return res.status(403)
        .json({message: "Authentication Token is not valid or expired"})
    }
}

module.exports = {
    isAuthenticated
}