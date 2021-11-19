const fetch = require("node-fetch");

class DataEntry {
  date;
  value;

  constructor(date, value) {
    this.date = date;
    this.value = value;
  }
}

class DataRowCollection {
  dataRow;

  constructor() {
    this.dataRow = [];
  }

  get ageGroups() {
    return Object.keys(this.dataRow[0].value).filter((tag) => tag !== "00+");
  }

  get currentData() {
    return this.dataRow[0];
  }

  get criticallity() {
    const globalInz = this.currentData.value["00+"].hosp7TInzidenz;
    if (globalInz === 0) return "okay";
    if (globalInz < 3) return "level1";
    if (globalInz < 6) return "level2";
    if (globalInz < 9) return "level3";
    return "catastrophic";
  }

  get critRating() {
    return this.currentData.value["00+"].hosp7TInzidenz / 9;
  }

  get maxInz5Days() {
    const lastDays = this.dataRow.slice(0, 5);
    return lastDays.sort(
      (a, b) => b.value["00+"].hosp7TInzidenz - a.value["00+"].hosp7TInzidenz
    )[0];
  }

  get gLevel() {
    const maxInz = this.maxInz5Days.value["00+"].hosp7TInzidenz;

    if (maxInz >= 9) {
      return "❌";
    }
    if (maxInz >= 6) {
      return "2G+";
    }
    if (maxInz >= 3) {
      return "2G";
    }
    return "3G";
  }

  addData(datum) {
    this.dataRow.push(datum);
  }

  sortDataByDate() {
    this.dataRow.sort((a, b) => b.date.getTime() - a.date.getTime());
  }
}

function csvToDataRows_old(data) {
  const regions = {};

  for (const datum of data.filter((d) => d.Bundesland)) {
    if (!(datum.Bundesland in regions)) {
      regions[datum.Bundesland] = new DataRowCollection();
    }

    regions[datum.Bundesland].addData(
      datum.Altersgruppe,
      new DataEntry(new Date(datum.Datum), {
        hosp7TTotal: parseInt(datum["7T_Hospitalisierung_Faelle"], 10),
        hosp7TInzidenz: parseFloat(datum["7T_Hospitalisierung_Inzidenz"]),
      })
    );
  }

  for (const dataRowCollection of Object.values(regions)) {
    dataRowCollection.sortDataByDate();
  }
  return regions;
}

function csvToDataRows(data) {
  const parsingRegions = {};

  for (const datum of data.filter((d) => d.Bundesland)) {
    if (!(datum.Bundesland in parsingRegions)) {
      parsingRegions[datum.Bundesland] = {};
    }
    if (!(datum.Datum in parsingRegions[datum.Bundesland])) {
      parsingRegions[datum.Bundesland][datum.Datum] = {};
    }

    parsingRegions[datum.Bundesland][datum.Datum][datum.Altersgruppe] = {
      hosp7TTotal: parseInt(datum["7T_Hospitalisierung_Faelle"], 10),
      hosp7TInzidenz: parseFloat(datum["7T_Hospitalisierung_Inzidenz"]),
    };
  }

  const regions = {};
  for (const regionName in parsingRegions) {
    regions[regionName] = new DataRowCollection();
    for (const date in parsingRegions[regionName]) {
      regions[regionName].addData(
        new DataEntry(new Date(date), parsingRegions[regionName][date])
      );
    }
  }

  for (const dataRowCollection of Object.values(regions)) {
    dataRowCollection.sortDataByDate();
  }
  return regions;
}

// function getCurrentData(data) {
//   const res = {};
//   for (const [region, dataRows] of Object.entries(data)) {
//     const regionCurrent = {};
//     for (const [tag, data] of Object.entries(dataRows.dataRows)) {
//       regionCurrent[tag] = data[0];
//     }
//     res[region] = regionCurrent;
//   }
//   return res;
// }

module.exports = async function getHospitData() {
  const response = await fetch(
    "https://raw.githubusercontent.com/robert-koch-institut/COVID-19-Hospitalisierungen_in_Deutschland/master/Aktuell_Deutschland_COVID-19-Hospitalisierungen.csv"
  );
  const csv = await response.text();
  const parsedCSVData = parseCSV(csv);
  const completeData = csvToDataRows(parsedCSVData);
  const { Bundesgebiet: bundesData, ...regionData } = completeData;

  return {
    total: bundesData,
    regions: regionData,
    completeData,
  };
};

function parseCSV(csv, seperator = ",") {
  const lines = csv.split("\n").map((line) => line.trim());
  const matrix = lines.map((line) => line.split(seperator));

  const [keys, ...data] = matrix;

  return data.map((datum) => {
    const res = {};
    for (let i = 0; i < keys.length && i < datum.length; i++) {
      res[keys[i]] = datum[i];
    }
    return res;
  });
}
