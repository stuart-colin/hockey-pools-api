const mongoose = require('mongoose');
const { toJSON, paginate } = require('../plugins');

const rosterSchema = mongoose.Schema(
  {
    owner: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'User',
    },
    center: [{ type: mongoose.SchemaTypes.ObjectId, ref: 'Player' }],
    left: [{ type: mongoose.SchemaTypes.ObjectId, ref: 'Player' }],
    right: [{ type: mongoose.SchemaTypes.ObjectId, ref: 'Player' }],
    defense: [{ type: mongoose.SchemaTypes.ObjectId, ref: 'Player' }],
    goalie: [{ type: mongoose.SchemaTypes.ObjectId, ref: 'Player' }],
    utility: { type: mongoose.SchemaTypes.ObjectId, ref: 'Player' },
  },
  {
    timestamps: true,
  }
);

// add plugin that converts mongoose to json
rosterSchema.plugin(toJSON);
rosterSchema.plugin(paginate);

/**
 * Check if the user exists by given name
 * @param {ObjectId} ownerId - The user's name
 * @returns {Promise<boolean>}
 */
rosterSchema.statics.hasRoster = async function (ownerId) {
  const roster = await this.findOne({ owner: ownerId });
  return !!roster;
};

/**
 * @typedef Roster
 */
const Roster = mongoose.model('Roster', rosterSchema);

module.exports = Roster;
