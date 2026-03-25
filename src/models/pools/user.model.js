const mongoose = require('mongoose');
const { toJSON, paginate } = require('../plugins');


const userSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    region: {
      type: String,
      required: true,
      trim: true,
    },
    country: {
      type: String,
      required: true,
      trim: true,
    },
    roster: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'Roster',
    },
  },
  {
    timestamps: true,
  }
);

// add plugin that converts mongoose to json
userSchema.plugin(toJSON);
userSchema.plugin(paginate);

/**
 * Check if the user exists by given name
 * @param {string} name - The user's name
 * @returns {Promise<boolean>}
 */
 userSchema.statics.isUserExist = async function (name) {
  const user = await this.findOne({ name });
  return !!user;
};

/**
 * Check if the user exists by given name
 * @param {string} id - The user's id
 * @returns {Promise<boolean>}
 */
 userSchema.statics.isUserExistId = async function (id) {
  const user = await this.findById(id);
  return !!user;
};

/**
 * @typedef User
 */
const User = mongoose.model('User', userSchema);

module.exports = User;
