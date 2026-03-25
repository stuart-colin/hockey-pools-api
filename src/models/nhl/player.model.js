const _ = require('lodash');
const mongoose = require('mongoose');
const { toJSON, paginate } = require('../plugins');
const { positions } = require('../../config/positions');

const playerSchema = mongoose.Schema(
  {
    nhl_id: {
      type: Number,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    position: {
      type: String,
      enum: positions,
      required: true,
    },
    headshot: {
      type: String,
      required: true,
      trim: true,
    },
    stats: {
      type: mongoose.SchemaTypes.Mixed,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

// add plugin that converts mongoose to json
playerSchema.plugin(toJSON);
playerSchema.plugin(paginate);

/**
 * Check if player exists in the database
 * @param {string} name - The user's email
 * @returns {Promise<boolean>}
 */
playerSchema.statics.isPlayerExist = async function (name) {
  const player = await this.findOne({ name: { $regex: name, $options: 'i' } });
  return !!player;
};

/**
 * Check if player exists in the database
 * @param {number} id - The user's email
 * @returns {Promise<boolean>}
 */
playerSchema.statics.isPlayerExistID = async function (nhlId) {
  const player = await this.findOne({ nhl_id: nhlId });
  console.log(`Player: ${!!player}`);
  return !!player;
};

/**
 * @typedef Player
 */
const Player = mongoose.model('Player', playerSchema);

module.exports = Player;
