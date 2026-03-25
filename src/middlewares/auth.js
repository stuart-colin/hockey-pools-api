const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const config = require('../config/config');

/**
 * JWKS client to fetch signing keys from Auth0.
 */
const client = jwksClient({
  jwksUri: `${config.auth.issuer}.well-known/jwks.json`,
});

/**
 * Helper function to retrieve the signing key based on the token's header.
 */
function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      return callback(err);
    }
    const signingKey = key.publicKey || key.rsaPublicKey;
    callback(null, signingKey);
  });
}

/**
 * Checks that the decoded token contains all required scopes.
 * Expects the scopes to be provided as a space-separated string (decodedToken.scope)
 * or as an array (decodedToken.scp).
 */
function checkRequiredScopes(decodedToken, requiredScopes) {
  console.log('requiredScopes', requiredScopes);

  if (!requiredScopes || requiredScopes.length === 0) {
    return;
  }
  let tokenScopes = [];
  if (decodedToken.permissions && Array.isArray(decodedToken.permissions)) {
    tokenScopes = decodedToken.permissions;
  }
  for (const scope of requiredScopes) {
    if (!tokenScopes.includes(scope)) {
      throw new ApiError(403, `Required scope "${scope}" is missing`);
    }
  }
}

/**
 * Uses the access token to fetch the user's info from Auth0's /userinfo endpoint.
 */
async function getUserInfo(accessToken) {
  const response = await fetch(`${config.auth.issuer}userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error('Failed to fetch user info');
  }
  return response.json();
}

/**
 * The auth middleware function.
 *
 * It performs the following steps:
 * 1. Validates the Authorization header contains a token.
 * 2. Verifies the token using Auth0's JWKS.
 * 3. Decodes the token and attaches it to req.user.
 * 4. Checks the decoded token for required scopes.
 * 5. Fetches the user's info from Auth0 and attaches it to req.userInfo.
 *
 * If any step fails, it passes an ApiError to next().
 *
 * @param {Array} requiredScopes - Array of scopes required to access the route.
 */
function auth(requiredScopes = []) {
  return (req, res, next) => {
    // Step 1: Validate that the token is included in the headers
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return next(new ApiError(httpStatus.UNAUTHORIZED, 'Missing Authorization header'));
    }
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return next(
        new ApiError(httpStatus.UNAUTHORIZED, 'Invalid Authorization header format. Format must be "Bearer <token>"')
      );
    }
    const token = parts[1].trim();
    if (!token) {
      return next(new ApiError(httpStatus.UNAUTHORIZED, 'No token provided'));
    }
    console.log(token)
    // Steps 2 & 3: Verify and decode the token
    jwt.verify(
      token,
      getKey,
      {
        audience: config.auth.audience, // Your API identifier
        issuer: config.auth.issuer, // Your Auth0 domain
        algorithms: config.auth.algorithms, // Auth0 tokens are signed using RS256
      },
      async (err, decoded) => {
        if (err) {
          return next(new ApiError(httpStatus.UNAUTHORIZED, 'Token verification failed: ' + err.message));
        }
        // Attach the decoded token to the request
        req.user = decoded;

        // Step 4: Check the required scopes
        try {
          checkRequiredScopes(decoded, requiredScopes);
        } catch (scopeError) {
          return next(scopeError);
        }

        // Step 5: Get the user info
        try {
          const userInfo = await getUserInfo(token);
          req.userInfo = userInfo;
        } catch (userInfoError) {
          return next(new ApiError(httpStatus.UNAUTHORIZED, 'Failed to get user info: ' + userInfoError.message));
        }

        // All steps succeeded
        next();
      }
    );
  };
}

module.exports = auth;
