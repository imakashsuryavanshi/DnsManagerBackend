const express = require('express');
const routes = express.Router();
const { isAuthenticated } = require('../middelwares/auth');
const { listDns, createDns, updateDns, deleteDns, bulkUpload, getFilteredRecords, getDataDistribution } = require('../controllers/dnsController');

const multer = require('multer');
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
      cb(null, file.originalname);
    }
  });
  
  const upload = multer({ storage: storage });

// Routes for DNS records CRUD operations
routes.get('/list', isAuthenticated, listDns);

routes.get('/filtered', isAuthenticated, getFilteredRecords);

routes.get('/distributed', isAuthenticated, getDataDistribution)

routes.post('/create', isAuthenticated, createDns);

routes.put('/update/', isAuthenticated, updateDns);

routes.delete('/delete/:id', isAuthenticated, deleteDns);

routes.post('/bulkupload', upload.single('file'), isAuthenticated, bulkUpload);

module.exports = routes ;