const express = require('express');
const docsRoute = require('./docs.route');
const nhlRoute = require('./nhl.route');
const playerRoute = require('./player.route');
const rosterRoute = require('./roster.route');
const userRoute = require('./user.route');
const config = require('../../config/config');

const router = express.Router();

const defaultRoutes = [
  {
    path: '/nhl',
    route: nhlRoute,
  },
  {
    path: '/players',
    route: playerRoute,
  },
  {
    path: '/users',
    route: userRoute,
  },
  {
    path: '/rosters',
    route: rosterRoute,
  },
];

const devRoutes = [
  // routes available only in development mode
  {
    path: '/docs',
    route: docsRoute,
  },
];

defaultRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

/* istanbul ignore next */
if (config.env === 'development') {
  devRoutes.forEach((route) => {
    router.use(route.path, route.route);
  });
}

module.exports = router;
