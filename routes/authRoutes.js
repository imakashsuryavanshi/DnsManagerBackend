const express = require('express');
const { registerUser, loginUser, getUsers } = require('../controllers/userController');
const { registeredUsersValidation, loginUsersValidation } = require('../middelwares/userValidation');
const {isAuthenticated} = require('../middelwares/auth');
const routes = express.Router();

routes.post('/register',registeredUsersValidation, registerUser);

routes.post('/login',loginUsersValidation, loginUser);

routes.get('/users', isAuthenticated, getUsers );

//routes.post('/create', isAuthenticated, createRecord);


module.exports = routes;