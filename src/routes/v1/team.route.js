const express = require('express');
const teamController = require('../../controllers/team.controller');

const router = express.Router();

router.route('/').post(teamController.createTeam);

router.route('/:teamName').get(teamController.getTeam);
router.route('/id/:teamId').get(teamController.getTeamById);

// router
//   .route('/:userId')
//   .get(auth('getUsers'), validate(userValidation.getUser), userController.getUser)
//   .patch(auth('manageUsers'), validate(userValidation.updateUser), userController.updateUser)
//   .delete(auth('manageUsers'), validate(userValidation.deleteUser), userController.deleteUser);

module.exports = router;
