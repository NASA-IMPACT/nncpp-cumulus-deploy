const assoc = require('lodash/fp/assoc');
const fs = require('fs');
const parse = require('csv-parse/lib/sync');
const path = require('path');
const S = require('sanctuary');

/**
 * An LVIS flight with date and site information.
 *
 * @typedef {Object} Flight
 * @property {number} mjd - Modified Julian Date of the start of the flight
 * @property {Date} startDate - date and time of the start of the flight
 * @property {string} flightNumber - flight number, formatted as
 *    `"MJD_SECONDS"`, where `MJD` is this flight's `mjd` value and `SECONDS`
 *    is the number of seconds since midnight of the start of the flight
 * @property {string} site - name of the site where images were taken
 */

/**
 * Returns the number of seconds since midnight in the time portion of the
 * specified UTC date.
 *
 * @param {Date} date - a UTC date
 * @returns {number} the number of seconds since midnight in the time portion
 *    of the specified UTC date
 */
const secondsSinceMidnight = (date) =>
  date.getUTCHours() * 3600 + date.getUTCMinutes() * 60 + date.getUTCSeconds();

/**
 * Returns the flight number of the specified flight.
 *
 * @param {Flight} flight
 * @returns {string} the flight number of the specified flight
 */
const flightNumber = (flight) => {
  const mjd = S.prop('mjd')(flight);
  const startDate = S.prop('startDate')(flight);
  const seconds = `${secondsSinceMidnight(startDate)}`.padStart(6, 0);

  return `${mjd}_${seconds}`
};

/**
 * Returns an array of the LVIS flights.
 *
 * @returns {Flight[]} an array of the LVIS flights
 * @function
 */
const flights = (() => {
  // TODO: Consider using S.encase to wrap errors
  const flightsCSV = fs.readFileSync(path.join(__dirname, 'Flight.csv'));
  const flights =
    parse(flightsCSV, {
      cast: (value, { column }) =>
        column === 'startDate' ? new Date(value) : value,
      columns: true,
      skipEmptyLines: true
    });
  const flightsWithFlightNumbers = Object.freeze(
    flights.map((flight) => assoc("flightNumber", flightNumber(flight), flight))
  );

  return () => flightsWithFlightNumbers;
})();

/**
 * Returns an S.Maybe of the flight that started on the specified date (year,
 * month, and day).
 *
 * @param {{ year, month, day }} date - full year, month (1-12), and day of
 *    month (1-31) of the start date of the flight to find
 * @return {Maybe<Flight>} an S.Maybe of the flight on the specified date
 */
const startedOn = ({ year, month, day }) => {
  const searchUTC = Date.UTC(year, month - 1, day);
  const toUTC = (date) => Date.UTC(
    date.getFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  );

  // TODO: Return an S.Either when the flights function is changed to do so too.
  return S.find(({ startDate }) => toUTC(startDate) === searchUTC)(flights());
}

const Flight = {
  startedOn,
}

module.exports = Flight;
