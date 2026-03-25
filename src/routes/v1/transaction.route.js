const express = require('express');
const transactionController = require('../../controllers/transaction.controller');

const router = express.Router();

router.route('/exists').get(transactionController.isTransactionExist);
router.route('/:id').get(transactionController.getTransactionByID);
//   .patch(auth('manageUsers'), validate(userValidation.updateUser), userController.updateUser)
//   .delete(auth('manageUsers'), validate(userValidation.deleteUser), userController.deleteUser);

module.exports = router;
