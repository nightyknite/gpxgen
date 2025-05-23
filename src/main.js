const _ = require('lodash');
const dayjs = require('dayjs');
const { parseArgs } = require('node:util');
const xml2js = require('xml2js');
const ExifReader = require('exifreader');
const fs = require('fs').promises;

require('dayjs/locale/ja');
const timezone = require('dayjs/plugin/timezone');
const utc = require('dayjs/plugin/utc');

// UTCプラグインを読み込み
dayjs.extend(utc);
// timezoneプラグインを読み込み
dayjs.extend(timezone);
// タイムゾーンのデフォルトをJST化
dayjs.tz.setDefault('Asia/Tokyo');

const { values } = parseArgs({
  args: process.args,
  allowPositionals: true,
  options: {
    in: {
      type: 'string'
    },
    out: {
      type: 'string'
    },
    altitude: {
      type: 'string'
    }
  }
});

const main = async (inputDir, outFile, altitude) => {
  // 指定したディレクトリのファイルを読み込み
  const files = await fs.readdir(inputDir).catch(e => {
    console.log(e);
  });
  const trkpt = [];
  for (filename of files) {
    // ファイル読み込み
    const fileBuffer = await fs.readFile(inputDir + filename).catch(e => {
      console.log(e);
    });
    // fileからexif情報の取得
    const tags = ExifReader.load(fileBuffer);
    const dateDescription = tags.DateTimeDigitized?.description;
    const dateText = dateDescription.split(' ')[0].replaceAll(':', '/') + dateDescription.split(' ')[1].trim();
    const trk = {
      $: {
        lat: tags.GPSLatitude?.description,
        lon: tags.GPSLongitude?.description,
      },
      ele: tags.GPSAltitude?.value[0] ? (tags.GPSAltitude?.value[0] / tags.GPSAltitude?.value[1]) : 0,
      time: dayjs(dateText).utc().format(),
    };
    if ((tags.GPSAltitude?.value[0] / tags.GPSAltitude?.value[1] > 0) || altitude === 'all') {
      trkpt.push(trk);
    }
  }

  // 撮影日付順に並び替え
  _.sortBy(trkpt, (o) => Date.parse(o.time));

  const maxlat = _.maxBy(trkpt, (o) => {
    return o.$?.lat;
  })?.$?.lat;
  const maxlon = _.maxBy(trkpt, (o) => {
    return o.$?.lon;
  })?.$?.lon;
  const minlat = _.minBy(trkpt, (o) => {
    return o.$?.lat;
  })?.$?.lat;
  const minlon = _.minBy(trkpt, (o) => {
    return o.$?.lon;
  })?.$?.lon;

  const builder = new xml2js.Builder({
    xmldec: { version: '1.0', encoding: 'UTF-8' },
  });
  const obj = {
    gpx: {
      $: {
        xmlns: 'http://www.topografix.com/GPX/1/1',
        'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
        'xsi:schemaLocation':
          'http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd',
        creator: '',
      },
      metadata: {
        bounds: {
          $: {
            maxlat,
            maxlon,
            minlat,
            minlon,
          },
        },
      },
      trk: {
        name: 'track',
        number: 1,
        trkseg: {
          trkpt,
        },
      },
    },
  };
  const xml = builder.buildObject(obj);
  fs.writeFile(outFile ?? 'out.gpx', xml).catch(e => {
    console.log(e);
  });
};

main(values.in, values.out, values.altitude);