<template>
  <div class="container grey-container">
    <div class="columns is-multiline">
      <!-- Use is-one-fifth to make 5 elements fit in one row -->
      <div class="column is-one-fifth">
        <div class="field">
          <label class="label">Easting [m]</label>
          <div class="control">
            <input class="input" id="easting" v-model="easting" type="number" placeholder="Easting" readonly>
          </div>
        </div>
      </div>
      <div class="column is-one-fifth">
        <div class="field">
          <label class="label">Northing [m]</label>
          <div class="control">
            <input class="input" id="northing" v-model="northing" type="number" placeholder="Northing" readonly>
          </div>
        </div>
      </div>
      <div class="column is-one-fifth">
        <div class="field">
          <label class="label">Instrument height [m]</label>
          <div class="control">
            <input class="input" id="instrumentHeight" v-model="instrumentHeight" type="number" step="0.1"
              placeholder="Instrument height [m]">
          </div>
        </div>
      </div>
      <div class="column is-one-fifth">
        <div class="field">
          <label class="label">Elevation mask [°]</label>
          <div class="control">
            <input class="input" id="elevationMask" v-model="elevationMask" type="number" step="0.1"
              placeholder="Elevation mask [°]">
          </div>
        </div>
      </div>
      <div class="column is-one-fifth">
        <div class="field">
          <label class="label">Date/Time</label>
          <div class="control">
            <input class="input" id="datetime" v-model="datetime" type="datetime-local" placeholder="Date/Time">
          </div>
        </div>
      </div>
      <!-- Ensure button takes full width to move to the next line -->
      <div class="column is-full">
        <div class="field">
          <div class="control">
            <button class="button is-link is-fullwidth" @click="getGNSSvisibility">Get GNSS visibility</button>
          </div>
        </div>
      </div>
      <!-- Radiobutton for (sky)plot constellation -->
      <div class="column is-full">
        <div class="field">
          <div class="control">
            <label class="radio">
              <input type="radio" name="constellation" value="ALL" @click="addConstellation" checked />
              ALL
            </label>
            <label class="radio">
              <input type="radio" name="constellation" value="GPS" @click="addConstellation" />
              GPS
            </label>
            <label class="radio">
              <input type="radio" name="constellation" value="GLONASS" @click="addConstellation" />
              GLONASS
            </label>
            <label class="radio">
              <input type="radio" name="constellation" value="GALILEO" @click="addConstellation" />
              GALILEO
            </label>
            <label class="radio">
              <input type="radio" name="constellation" value="BEIDOU" @click="addConstellation" />
              BEIDOU
            </label>
            <label class="radio">
              <input type="radio" name="constellation" value="IRNSS" @click="addConstellation" />
              IRNSS
            </label>
            <label class="radio">
              <input type="radio" name="constellation" value="QZSS" @click="addConstellation" />
              QZSS
            </label>

          </div>
        </div>
      </div>
    </div>
  </div>
</template>


<script>

import { computed } from 'vue';
import { useCoordinatesStore } from '@/stores/coordinatesStore';
import { useMapStore } from '@/stores/mapStore';
import { useSkyPlotStore } from '@/stores/skyplotStore';
import { TleSatellite, nf02ToBessel, mn95ToWgs84 } from '@/modules-sat/api.js';
import { compute_satellite } from '@/modules-sat/compute.js';
import { request_profile } from '@/modules-topography/api.js';
import { calcElevation, maxElevation, point_launched } from '@/modules-topography/compute.js';

export default {
  name: 'FormInput',

  // fields easting and northing are dynamically defined with global event and storage coordinatesStore
  setup() {
    const coordinatesStore = useCoordinatesStore();
    const easting = computed(() => coordinatesStore.easting);
    const northing = computed(() => coordinatesStore.northing);
    return {
      easting,
      northing
    };
  },

  // defaut data
  data() {
    const now = new Date(); // Get the current date and time
    const utc1Time = new Date(now.getTime() + (60 * 60 * 1000)); // Add 1 hour for UTC+1
    return {
      datetime: utc1Time.toISOString().slice(0, 16), // Sets datetime to the current date and time in UTC+1
      instrumentHeight: 1.70,
      elevationMask: 5.0,
      response: null,
      responseDataMask: null,
      responseDataSatellite: null,
    };
  },

  methods: {

    async fetchHeight() {

      // method to fetch simple altitude from CH geo admin API
      const url = `https://api3.geo.admin.ch/rest/services/height?easting=${this.easting}&northing=${this.northing}`;
      try {
        const result = await fetch(url);
        if (!result.ok) {
          throw new Error('Erreur lors de la récupération des données');
        }
        const data = await result.json();
        this.response = data
        // get the height from response
        this.height = this.response['height']
      } catch (error) {
        this.response = error.message;
      }

    },

    async responseToListEastNorth(data) {
      // Create list for return
      const response = [];

      // Browse data for get easting and northing
      data.forEach(element => {
        const point = [element.easting, element.northing];
        response.push(point);
      })
      response.push([data[0].easting, data[1].northing]);

      return response;
    },

    async responseToListsAziElev(dataStringAziElev) {

      // Create list for return response
      const response = [];

      // Browse data for get azimut and elevation
      dataStringAziElev.forEach(element => {
        let azimut = element.phi;
        const point = [azimut, element.elevation];
        response.push(point);
      })
      return response;
    },

    async getSatelittes(JSONrequest) {
      try {

        // Download TLE Message
        const tle_message = await TleSatellite('json');

        // Recover user-recorded date and time
        const date = new Date(JSONrequest.datetime);

        // Get receiver's position
        const obs_position = {
          "east": JSONrequest.E,
          "north": JSONrequest.N,
          "height_NF02": JSONrequest.H
        };

        //TODO: vérifier la conversion des données de MN95/NF02 vers WGS84

        // Compute position WGS84 from MN95 position
        const height_bessel = await nf02ToBessel(obs_position.east, obs_position.north, obs_position.height_NF02);

        // Add element to observator Object
        obs_position.height_bessel = parseFloat(height_bessel.altitude);

        // MN95/Bessel to WGS84:
        const wgs84 = await mn95ToWgs84(obs_position.east, obs_position.north, obs_position.height_bessel);

        // Add element to observator Object
        obs_position.latitude = parseFloat(wgs84.easting);
        obs_position.longitude = parseFloat(wgs84.northing);
        obs_position.height = parseFloat(wgs84.altitude);

        // Create return response
        const response_result = [];

        // Range date on 6 hours
        for (let i = 0; i < 6; i++) {

          // Create new date
          //const newDate = date.setHours(date.getMinutes() + (i*30));
          const newDate = new Date(date.getTime() + (i * 60 * 60 * 1000)); // Ajouter une heure

          // Compute position's SV
          const res = compute_satellite(obs_position, newDate, tle_message);

          const temp = {}
          temp.date = newDate;
          temp.data = res;
          response_result.push(temp);

        }
        //console.log("Data with hours", response_result)


        // Compute position's SV
        //const res = compute_satellite(obs_position, date, tle_message);
        return response_result;

      } catch (error) {
        console.log("ERROR", error);
        throw error; // Rethrow the error so that it can be caught by the caller
      }
    },


    /**
     * Request mask topography
     * 
     * @param {Object} JSONrequest 
     */
    async getTopography(JSONrequest) {

      try {

        // Reforme in object
        const coord_start = [JSONrequest.E, JSONrequest.N];
        const height_instrument = JSONrequest.instrumentHeight;

        const tabpromise = [];

        // Iteration, on angles from 0 to 359
        for (let i = 0; i < 360; i++) {
          const coord_end = point_launched(coord_start, i);
          const profile = request_profile(coord_start, coord_end);
          tabpromise.push(profile);
        }

        // Calculate elevation as soon as all requests have been passed.
        return Promise.all(tabpromise).then(results => {
          const data = calcElevation(results, coord_start, height_instrument);
          const mask = maxElevation(data);
          return mask;
        });

      } catch (error) {
        console.log("ERROR", error);
        throw error; // Rethrow the error so that it can be caught by the caller
      }
    },

    async getGNSSvisibility() {

      // MAIN PROCESS CLIENT-SIDE (WHEN 'GET' IS CLICKED)
      // ************************************************


      // =====================================
      // === GET HEIGHT FROM GEO.ADMIN API ===
      // =====================================
      // calling fetch method simple altitude from CH geo admin API
      await this.fetchHeight();


      // ==================================
      // === GET USER'S INPUT FORM DATA ===
      // ==================================
      // formatting JSON object according to form user's inputs
      const JSONrequest = {
        'E': this.easting,
        'N': this.northing,
        'H': parseFloat(this.height),
        'instrumentHeight': this.instrumentHeight,
        'elevationMask': this.elevationMask,
        'datetime': this.datetime
      };

      // ==============================
      // === DRAW THE POLAR SKYPLOT ===
      // ==============================

      // TOPOGRAPHY MASK
      // ---------------
      const dataTopoMask = await this.getTopography(JSONrequest);
      this.responseDataMask = dataTopoMask;
      console.log(dataTopoMask);

      // SATELITTE SCATTER 
      // -----------------
      const dataSatellite = await this.getSatelittes(JSONrequest);
      this.responseDataSatellite = dataSatellite;
      const dataSatellite_last = dataSatellite.slice(-1);


      // PLOT ELEMENTS ON POLAR CHARTS
      // -----------------------------
      const listAziElevOfRelief = await this.responseToListsAziElev(dataTopoMask);
      const skyPlotStore = useSkyPlotStore(); // get the stored chart first
      skyPlotStore.removeAllSeries(); // delete existing data first
      skyPlotStore.drawSatsOnSykPlot(dataSatellite_last[0].data, "ALL");
      //skyPlotStore.drawSatsOnSykPlot_traj(dataSatellite, constellation_user);
      skyPlotStore.drawReliefOnSkyPlot(listAziElevOfRelief);
      skyPlotStore.drawMaskElevetionOnSkyPlot(this.elevationMask);



      // ==============================
      // === DRAW RELIEF ON THE MAP ===
      // ==============================
      const listENofRelief = await this.responseToListEastNorth(dataTopoMask);
      // get the stored map (gloabl)
      const mapStore = useMapStore();
      // delete layer on the map (not the background)
      mapStore.invokeClearMapLayers();
      // drawing line on 2D-map
      mapStore.invokeAddLineLayer(listENofRelief);
    },

    async addConstellation() {

      if (this.responseDataMask === null && this.responseDataSatellite === null) {
        alert("first click on 'Get GNSS visibility'");

        // Set radiobutton 'all'
        const input = document.getElementsByName('constellation');
        for (let i = 0; i < input.length; i++) {
          if (input[i].value == "ALL") {
            input[i].checked = true
          } else {
            input[i].checked = false
          }
        }

      } else {

        //Get radioButton checked
        const input = document.getElementsByName('constellation');
        let constel = 0;
        for (let i = 0; i < input.length; i++) {
          if (input[i].checked) {
            constel = input[i].value;
          }
        }

        // Modify skyplot
        const listAziElevOfRelief = await this.responseToListsAziElev(this.responseDataMask);
        const skyPlotStore = useSkyPlotStore(); // get the stored chart first
        skyPlotStore.removeAllSeries(); // delete existing data first
        skyPlotStore.drawSatsOnSykPlot(this.responseDataSatellite.slice(-1)[0].data, constel);
        skyPlotStore.drawSatsOnSykPlot_traj(this.responseDataSatellite, constel);
        skyPlotStore.drawReliefOnSkyPlot(listAziElevOfRelief);
        skyPlotStore.drawMaskElevetionOnSkyPlot(this.elevationMask);
      }
    }
  }
}
</script>

<style>
.grey-container {
  padding: 20px;
  background-color: lightgrey;
  border-radius: 10px;
}

.label:not(:last-child) {
  margin-bottom: 0.0em !important;
}

.column {
  display: block;
  flex-basis: 0;
  flex-grow: 1;
  flex-shrink: 1;
  padding: 0.3rem !important;
}
</style>
