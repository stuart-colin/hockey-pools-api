const mongoose = require('mongoose');
const { toJSON, paginate } = require('../plugins');

const statsSchema = mongoose.Schema(
  {
    player: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'Player',
      required: true,
    },
    year: {
      type: String,
      required: true,
    },
    goals: {
      type: Number,
      required: true,
    },
    assists: {
      type: Number,
      required: true,
    },
    gwgs: {
      type: Number,
      required: true,
    },
    wins: {
      type: Number,
      required: true,
    },
    losses: {
      type: Number,
      required: true,
    },
    shutouts: {
      type: Number,
      required: true,
    },
    ot: {
      type: Number,
      required: true,
    }
  },
  {
    timestamps: true,
  }
);

// add plugin that converts mongoose to json
statsSchema.plugin(toJSON);
statsSchema.plugin(paginate);

/**
 * Check if stat year exists for a given player in the database
 * @param {string} name - The user's email
 * @returns {Promise<boolean>}
 */
statsSchema.statics.isStatYearExist = async function (playerId, year) {
  const stat = await this.findOne({ player: playerId, year: year });
  return !!stat;
};

/**
 * @typedef Stats
 */
const Stats = mongoose.model('Stats', statsSchema);

module.exports = Stats;
