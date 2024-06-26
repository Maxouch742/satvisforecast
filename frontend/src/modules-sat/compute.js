import { convertJSON } from "./convertJSON.js";
import { constellation } from "./constellation.js"
import { propagate, eciToGeodetic, geodeticToEcf, ecfToLookAngles, gstime, twoline2satrec } from 'satellite.js'


/**
 * Calculate satellite position (azimuth and elevation) relavite
 * to receiver position and user-selected time
 * 
 * @param {Object} obs_position 
 * @param {Date} date 
 * @param {JSON} tle_message 
 * @returns 
 */
export function compute_satellite(obs_position, date, tle_message){

    // Create array for return
    const satellite_return = [];

    tle_message.forEach((orbit) => {

        // Convert JSON to text
        const tle_orbit = convertJSON(orbit);

        // Get constellation of satellite
        const constella = constellation(orbit.OBJECT_NAME);
        if ( constella !== false){

            // Decode text message
            const satrec = twoline2satrec(
                tle_orbit.split('\n')[0].trim(), 
                tle_orbit.split('\n')[1].trim()
            );

            // Compute position and velocity
            const positionAndVelocity = propagate(satrec, date);
            const gmst = gstime(date);

            if (positionAndVelocity.position !== undefined){
            
                // Compute and convert position
                const position_geodetic = eciToGeodetic(positionAndVelocity.position, gmst);  // returns in radians
                const position_ecf = geodeticToEcf(position_geodetic); // returns in cartesiens
                const position_az_el = ecfToLookAngles(obs_position, position_ecf);  // angles in radians
                const azi = position_az_el["azimuth"] * 180.0 / Math.PI;
                const ele = position_az_el["elevation"] * 180.0 / Math.PI;

                // Selecting visible satellites
                if (ele > 0.0){

                    // Create object and push to array
                    const obj = {
                        name: orbit.OBJECT_NAME,
                        constellation: constella,
                        id: orbit.OBJECT_ID,
                        azimut: azi,
                        elevation: ele,
                        longitude: position_geodetic.longitude * 180.0 / Math.PI,
                        latitude: position_geodetic.latitude * 180.0 / Math.PI,
                        height: position_geodetic.height,
                    }
                    satellite_return.push(obj);

                }
            }
        }
    })
    return satellite_return;
}