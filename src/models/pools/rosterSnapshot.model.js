const mongoose = require('mongoose');
const { toJSON, paginate } = require('../plugins');

// One row per (roster, date). Captures total pool points for a roster on a
// specific NHL game date, so the frontend can render a leaderboard scrubber
// and a per-roster line chart over the whole playoffs.
//
// Designed to survive off-season Roster wipes:
//   - `ownerName` is denormalized so the chart legend stays readable forever.
//   - We never `.populate('roster')` or `.populate('owner')` on read; the row
//     is self-sufficient.
//   - Wipes do not cascade to RosterSnapshot.
const rosterSnapshotSchema = mongoose.Schema(
  {
    season: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    date: {
      type: String,
      required: true,
      trim: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    roster: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'Roster',
      required: true,
    },
    owner: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'User',
      required: true,
    },
    ownerName: {
      type: String,
      required: true,
      trim: true,
    },
    points: {
      type: Number,
      required: true,
      default: 0,
    },
    playersRemaining: {
      type: Number,
      default: null,
    },
    rank: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

rosterSnapshotSchema.plugin(toJSON);
rosterSnapshotSchema.plugin(paginate);

rosterSnapshotSchema.index({ season: 1, date: 1 });
rosterSnapshotSchema.index({ roster: 1, date: 1 }, { unique: true });
rosterSnapshotSchema.index({ owner: 1, season: 1, date: 1 });

/**
 * @typedef RosterSnapshot
 */
const RosterSnapshot = mongoose.model('RosterSnapshot', rosterSnapshotSchema);

module.exports = RosterSnapshot;
