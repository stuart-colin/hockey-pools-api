const dotenv = require('dotenv');
const path = require('path');
const Joi = require('joi');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const envVarsSchema = Joi.object()
  .keys({
    NODE_ENV: Joi.string().valid('production', 'development', 'test').required(),
    PORT: Joi.number().default(3000),
    // MONGODB_URL: Joi.string().required().description('Mongo DB url'),
    MONGODB_DB: Joi.string().required().description('Mongo DB Database'),
    MONGODB_NAME: Joi.string().required().description('Mongo DB Name'),
    MONGODB_USER: Joi.string().required().description('Mongo DB User'),
    MONGODB_PASS: Joi.string().required().description('Mongo DB Password'),
    AUTH_AUDIENCE: Joi.string().required().description('Auth audience'),
    AUTH_ISSUER: Joi.string().required().description('Auth issuer'),
    AUTH_ALGORITHMS: Joi.string().required().description('Auth algorithms'),
    JWT_SECRET: Joi.string().required().description('JWT secret key'),
    JWT_ACCESS_EXPIRATION_MINUTES: Joi.number().default(30).description('minutes after which access tokens expire'),
    JWT_REFRESH_EXPIRATION_DAYS: Joi.number().default(30).description('days after which refresh tokens expire'),
    JWT_RESET_PASSWORD_EXPIRATION_MINUTES: Joi.number()
      .default(10)
      .description('minutes after which reset password token expires'),
    JWT_VERIFY_EMAIL_EXPIRATION_MINUTES: Joi.number()
      .default(10)
      .description('minutes after which verify email token expires'),
    SMTP_HOST: Joi.string().description('server that will send the emails'),
    SMTP_PORT: Joi.number().description('port to connect to the email server'),
    SMTP_USERNAME: Joi.string().description('username for email server'),
    SMTP_PASSWORD: Joi.string().description('password for email server'),
    EMAIL_FROM: Joi.string().description('the from field in the emails sent by the app'),
    NHL_WEB_API: Joi.string().required().description('NHL Web API endpoint'),
    NHL_REST_API: Joi.string().required().description('NHL REST API endpoint'),
    NHL_SUGGEST_API: Joi.string().required().description('NHL Suggest API endpoint'),
    PLAYOFFS_START_DATE: Joi.string()
      .pattern(/^\d{4}-\d{2}-\d{2}$/)
      .description('YYYY-MM-DD date the current Stanley Cup Playoffs begin; used for automated playoff OTL tallying.'),
  })
  .unknown();

const { value: envVars, error } = envVarsSchema.prefs({ errors: { label: 'key' } }).validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

module.exports = {
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  auth: {
    audience: envVars.AUTH_AUDIENCE,
    issuer: envVars.AUTH_ISSUER,
    algorithms: envVars.AUTH_ALGORITHMS.split(','),
  },
  mongoose: {
    // url: envVars.MONGODB_URL + (envVars.NODE_ENV === 'test' ? '-test' : ''),
    url: `mongodb+srv://${envVars.MONGODB_USER}:${envVars.MONGODB_PASS}@${envVars.MONGODB_USER}.limsu.mongodb.net/${envVars.MONGODB_NAME}?retryWrites=true&w=majority`,
    options: {
      // useCreateIndex: true,
      // useNewUrlParser: true,
      // useUnifiedTopology: true,
    },
  },
  jwt: {
    secret: envVars.JWT_SECRET,
    accessExpirationMinutes: envVars.JWT_ACCESS_EXPIRATION_MINUTES,
    refreshExpirationDays: envVars.JWT_REFRESH_EXPIRATION_DAYS,
    resetPasswordExpirationMinutes: envVars.JWT_RESET_PASSWORD_EXPIRATION_MINUTES,
    verifyEmailExpirationMinutes: envVars.JWT_VERIFY_EMAIL_EXPIRATION_MINUTES,
  },
  email: {
    smtp: {
      host: envVars.SMTP_HOST,
      port: envVars.SMTP_PORT,
      auth: {
        user: envVars.SMTP_USERNAME,
        pass: envVars.SMTP_PASSWORD,
      },
    },
    from: envVars.EMAIL_FROM,
  },
  nhl: {
    webApi: envVars.NHL_WEB_API,
    restApi: envVars.NHL_REST_API,
    suggestApi: envVars.NHL_SUGGEST_API,
  },
  playoffs: {
    startDate: envVars.PLAYOFFS_START_DATE,
  },
};
