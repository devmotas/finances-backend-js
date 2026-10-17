const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const BCRYPT_SALT_ROUNDS = 10;
const MS_PER_SECOND = 1000;
const ONE_DAY_MS = 24 * 60 * 60 * MS_PER_SECOND;

function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

function passwordMatches(password, hash) {
  return bcrypt.compare(password, hash);
}

function tokenLifetimeSeconds() {
  const lifetimeMs = Number(process.env.JWT_EXPIRATION_MS) || ONE_DAY_MS;
  return Math.floor(lifetimeMs / MS_PER_SECOND);
}

function signUserToken(userId) {
  return jwt.sign({ sub: userId.toString() }, process.env.JWT_SECRET, {
    expiresIn: tokenLifetimeSeconds(),
  });
}

function userIdFromToken(token) {
  const { sub } = jwt.verify(token, process.env.JWT_SECRET);
  return BigInt(sub);
}

module.exports = { hashPassword, passwordMatches, signUserToken, userIdFromToken };
