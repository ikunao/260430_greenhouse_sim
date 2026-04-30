/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  ComposedChart,
  Area,
  Bar,
  ReferenceLine,
  ReferenceDot,
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { Sun, Thermometer, Calendar, Play, Pause, RotateCcw, Plus, Trash2, Wind, Flame, Activity, AlertTriangle } from 'lucide-react';
import Papa from 'papaparse';
import RAW_CSV_DATA from './kisho.csv?raw';

// Weather Data Types
interface WeatherData {
  time: string;
  datetime: Date;
  solarRadiation: number;
  temperature: number;
  humidity: number;
  precipitation: number;
  windSpeed: number;
  dewPoint: number;
  cloudCover: number;
}

interface ControlEvent {
  id: string;
  hour: number;
  minute: number;
  type: 'vent' | 'heat' | 'co2';
  value: number; // 0-10
}

const interpolate = (p0: number, p1: number, t: number) => p0 + (p1 - p0) * t;

const CustomDot = (props: any) => {
  const { cx, cy, payload, isPlaybackActive } = props;
  if (payload && payload.isOriginalPoint) {
    return (
      <circle 
        cx={cx} 
        cy={cy} 
        r={3} 
        fill={props.stroke} 
        stroke="white" 
        strokeWidth={1} 
      />
    );
  }
  return null;
};

const ActivePlaybackDot = (props: any) => {
  const { cx, cy, stroke } = props;
  return (
    <g>
      <circle cx={cx} cy={cy} r={10} fill={stroke} opacity={0.15}>
        <animate attributeName="r" from="8" to="14" dur="1s" repeatCount="indefinite" />
        <animate attributeName="opacity" from="0.3" to="0" dur="1s" repeatCount="indefinite" />
      </circle>
      <circle cx={cx} cy={cy} r={4} fill={stroke} stroke="white" strokeWidth={2} />
    </g>
  );
};

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const filteredPayload = payload.filter((entry: any) => 
      entry.name && 
      !entry.name.includes('highlight') && 
      !entry.dataKey?.toString().includes('bottleneck')
    );

    return (
      <div className="bg-white/95 backdrop-blur-md p-2 rounded-lg border border-slate-200 shadow-xl font-mono text-[9px] z-50">
        <p className="text-slate-400 mb-1 border-b border-slate-100 pb-0.5">{data.fullTime}</p>
        <div className="space-y-0.5">
          {filteredPayload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1 font-bold" style={{ color: entry.color }}>
                {entry.name}:
              </span>
              <span className="text-slate-900 font-bold">
                {typeof entry.value === 'number' ? entry.value.toFixed(entry.name?.includes('日射') ? 2 : 1) : entry.value}
                {entry.name?.includes('温') || entry.name?.includes('露点') ? '°C' : 
                 entry.name?.includes('湿度') ? '%' : 
                 entry.name?.includes('日射') ? 'MJ' : 
                 entry.name?.includes('CO2') ? 'ppm' : 
                 entry.name?.includes('蒸散') ? 'g/m²' :
                 entry.name?.includes('光合成') ? 'µmol' : ''}
              </span>
            </div>
          ))}
        </div>
        {data.bottleneck && data.bottleneck !== 'none' && (
          <div className="mt-1.5 pt-1 border-t border-red-100 flex items-center gap-1">
            <AlertTriangle size={10} className="text-red-500" />
            <span className="text-red-600 font-black uppercase text-[7px] tracking-tighter">
              ボトルネック: {data.bottleneck === 'temp' ? '気温' : data.bottleneck === 'co2' ? 'CO2' : '日射'}
            </span>
          </div>
        )}
      </div>
    );
  }
  return null;
};

const Gauge = ({ value, min, max, colorClass }: { value: number, min: number, max: number, colorClass: string }) => {
  const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  const radius = 16;
  const circumference = Math.PI * radius; 
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative w-12 h-7 flex items-end justify-center overflow-hidden">
      <svg viewBox="0 0 40 22" className="w-full h-full">
        <path
          d="M 4 20 A 16 16 0 0 1 36 20"
          fill="none"
          stroke="rgba(0,0,0,0.05)"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M 4 20 A 16 16 0 0 1 36 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={colorClass}
          style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
        />
      </svg>
      <div className="absolute bottom-0 text-[7px] font-black tracking-tighter text-slate-400">
        {Math.round(percentage)}%
      </div>
    </div>
  );
};

const getClearSkyRadiation = (date: Date) => {
  // Kochi City Coordinates
  const lat = 33.5597 * Math.PI / 180;
  
  // Summer Solstice (夏至) around day 173
  const dayOfYear = 173; 

  // Solar Declination at Summer Solstice
  const declination = 23.45 * Math.sin((2 * Math.PI / 365) * (dayOfYear - 81)) * Math.PI / 180;
  
  // Hour Angle
  const hours = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  const hourAngle = (hours - 12) * 15 * Math.PI / 180;

  // Solar Altitude (Sin)
  const sinAlt = Math.sin(lat) * Math.sin(declination) + Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle);
  
  if (sinAlt <= 0) return 0;

  // Simple clear sky model based on altitude
  const solarConstant = 1367; // W/m2
  const airMass = 1 / (sinAlt + 0.15 * Math.pow(Math.asin(sinAlt) * 180 / Math.PI + 3.885, -1.253));
  const transmission = 0.75; // Kochi summer clear sky tends to be quite high if not humid
  
  // Estimate MJ/m2/h from W/m2 (Integrated over 1 hour)
  const radiationWatts = solarConstant * Math.pow(transmission, airMass) * sinAlt;
  return (radiationWatts * 3600) / 1000000;
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'graph' | 'data'>('graph');
  const [selectedDate, setSelectedDate] = useState<string>('');

  const { allData, availableDates } = useMemo(() => {
    // Parse without header to handle mangled encodings or missing headers safely
    const results = Papa.parse(RAW_CSV_DATA, { header: false, skipEmptyLines: true });
    
    if (results.data.length < 2) return { allData: [], availableDates: [] };

    const rows = results.data as string[][];
    const header = rows[0];
    const dataRows = rows.slice(1);

    // Identify columns by looking for keywords in headers (handling mangled names too)
    // Headers observed in kisho.csv (could be Shift-JIS or mangled UTF-8):
    // 0: Datetime (日時/N/N)
    // 1: Solar Radiation (日射量/˗)
    // 2: Temperature (気温/C)
    // 3: Humidity (相対湿度/Ύx)
    // 4: Precipitation (降水量/~)
    // 5: Wind Speed (風速/)
    // 6: Dew Point (露点温度/I_x)
    // 7: Cloud Cover (雲量/VC)

    const findIndex = (keywords: string[], defaultIdx: number) => {
      const idx = header.findIndex(h => keywords.some(k => (h || '').includes(k)));
      return idx !== -1 ? idx : defaultIdx;
    };

    const idxDateTime = findIndex(['日時', 'time', 'N', 'N'], 0);
    const idxSolar = findIndex(['日射', 'radiation', 'mj'], 1);
    const idxTemp = findIndex(['気温', 'temperature', 'C'], 2);
    const idxHumid = findIndex(['湿度', 'humidity', 'x'], 3);
    const idxPrecip = findIndex(['降水', 'precip', 'mm'], 4);
    const idxWind = findIndex(['風速', 'wind', 'm/s'], 5);
    const idxDew = findIndex(['露点', 'dew', 'I'], 6);
    const idxCloud = findIndex(['雲量', 'cloud', 'V'], 7);

    const hourlyData: WeatherData[] = dataRows
      .map((row) => {
        const dateStr = row[idxDateTime];
        if (!dateStr) return null;

        // Support both YYYY/MM/DD and YYYY-MM-DD
        const cleanDateStr = dateStr.replace(/\//g, '-');
        const parsedDate = new Date(cleanDateStr);
        
        if (isNaN(parsedDate.getTime())) return null;

        return {
          time: dateStr,
          datetime: parsedDate,
          solarRadiation: parseFloat(row[idxSolar] || '0'),
          temperature: parseFloat(row[idxTemp] || '0'),
          humidity: parseFloat(row[idxHumid] || '0'),
          precipitation: parseFloat(row[idxPrecip] || '0'),
          windSpeed: parseFloat(row[idxWind] || '0'),
          dewPoint: parseFloat(row[idxDew] || '0'),
          cloudCover: parseFloat(row[idxCloud] || '0'),
        };
      })
      .filter((d): d is WeatherData => d !== null)
      .sort((a, b) => a.datetime.getTime() - b.datetime.getTime());

    if (hourlyData.length === 0) return { allData: [], availableDates: [] };

    // Identify all unique dates in the data
    const dates = Array.from(new Set(hourlyData.map(d => {
        const year = d.datetime.getFullYear();
        const month = (d.datetime.getMonth() + 1).toString().padStart(2, '0');
        const day = d.datetime.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
    }))).sort();

    // Create a Set of original timestamps for accurate marking
    const originalTimestamps = new Set(hourlyData.map(d => d.datetime.getTime()));

    // Create a full map of 1-minute data
    const interpolated: any[] = [];
    
    // Add dummy rows at the very beginning and end if needed to cover first and last day fully
    const firstData = hourlyData[0];
    const lastData = hourlyData[hourlyData.length - 1];
    
    const startOfFirstDay = new Date(firstData.datetime);
    startOfFirstDay.setHours(0, 0, 0, 0);
    
    const endOfLastDay = new Date(lastData.datetime);
    endOfLastDay.setHours(23, 59, 0, 0);

    const fullHourlyData = [...hourlyData];
    // Always ensure we have the start of the first day and end of the last day for complete graphs
    if (firstData.datetime.getTime() > startOfFirstDay.getTime()) {
        fullHourlyData.unshift({ ...firstData, datetime: startOfFirstDay });
    }
    if (lastData.datetime.getTime() < endOfLastDay.getTime()) {
        fullHourlyData.push({ ...lastData, datetime: endOfLastDay });
    }

    const catmullRom = (p0: number, p1: number, p2: number, p3: number, t: number) => {
      const v0 = (p2 - p0) * 0.5;
      const v1 = (p3 - p1) * 0.5;
      const t2 = t * t;
      const t3 = t2 * t;
      return (2 * p1 - 2 * p2 + v0 + v1) * t3 + (-3 * p1 + 3 * p2 - 2 * v0 - v1) * t2 + v0 * t + p1;
    };

    for (let i = 0; i < fullHourlyData.length - 1; i++) {
        const prev = fullHourlyData[i - 1] || fullHourlyData[i];
        const current = fullHourlyData[i];
        const next = fullHourlyData[i + 1];
        const nextNext = fullHourlyData[i + 2] || next;

        const minutesDiff = Math.round((next.datetime.getTime() - current.datetime.getTime()) / (60 * 1000));
        if (minutesDiff <= 0) continue;

        const clearPrev = getClearSkyRadiation(prev.datetime);
        const clearCurrent = getClearSkyRadiation(current.datetime);
        const clearNext = getClearSkyRadiation(next.datetime);
        const clearNextNext = getClearSkyRadiation(nextNext.datetime);
        
        // Calculate transparency factor (K) to handle solar interpolation naturally
        const trans0 = clearPrev > 0.05 ? prev.solarRadiation / clearPrev : (prev.solarRadiation > 0 ? 1 : 0);
        const trans1 = clearCurrent > 0.05 ? current.solarRadiation / clearCurrent : (current.solarRadiation > 0 ? 1 : 0);
        const trans2 = clearNext > 0.05 ? next.solarRadiation / clearNext : (next.solarRadiation > 0 ? 1 : 0);
        const trans3 = clearNextNext > 0.05 ? nextNext.solarRadiation / clearNextNext : (nextNext.solarRadiation > 0 ? 1 : 0);

        for (let min = 0; min < minutesDiff; min++) {
            const t = min / minutesDiff;
            const subTime = new Date(current.datetime.getTime() + min * 60 * 1000);
            
            const year = subTime.getFullYear();
            const month = (subTime.getMonth() + 1).toString().padStart(2, '0');
            const day = subTime.getDate().toString().padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;
            
            // Catmull-Rom yields much more natural curves than linear or cosine
            const temp = catmullRom(prev.temperature, current.temperature, next.temperature, nextNext.temperature, t);
            const humid = catmullRom(prev.humidity, current.humidity, next.humidity, nextNext.humidity, t);
            const precip = catmullRom(prev.precipitation, current.precipitation, next.precipitation, nextNext.precipitation, t);
            const dew = catmullRom(prev.dewPoint, current.dewPoint, next.dewPoint, nextNext.dewPoint, t);
            const reportedCloud = catmullRom(prev.cloudCover, current.cloudCover, next.cloudCover, nextNext.cloudCover, t);
            
            // Solar interpolation using clear sky curve * transparency
            const trans = catmullRom(trans0, trans1, trans2, trans3, t);
            const clearSky = getClearSkyRadiation(subTime);
            // Clamp transparency to avoid negative radiation from spline overshoot at sharp changes
            const estimatedSolar = Math.max(0, clearSky * trans);

            let inferredCloud = (1 - Math.min(1.2, trans)) * 10;
            if (precip > 0) inferredCloud = Math.max(inferredCloud, 8);
            
            // At night, use reported cloud. During day, blend with solar observations.
            const finalCloud = clearSky > 0.1 ? (reportedCloud * 0.4 + inferredCloud * 0.6) : reportedCloud;

            interpolated.push({
                date: dateStr,
                rawTime: subTime.getHours() * 60 + subTime.getMinutes(),
                timeLabel: `${subTime.getHours().toString().padStart(2, '0')}:${subTime.getMinutes().toString().padStart(2, '0')}`,
                fullTime: subTime.toLocaleString('ja-JP'),
                temperature: temp,
                humidity: Math.max(0, Math.min(100, humid)),
                precipitation: Math.max(0, precip),
                dewPoint: dew,
                solarRadiation: estimatedSolar,
                clearSkyRadiation: clearSky,
                cloudCover: Math.max(0, Math.min(10, finalCloud)),
                isOriginalPoint: originalTimestamps.has(subTime.getTime()), // Accurate marking
            });
        }
    }

    // Add the very last minute
    const lastItem = interpolated[interpolated.length - 1];
    if (lastItem) {
        interpolated.push({
            ...lastItem,
            rawTime: 1439,
            timeLabel: '23:59',
        });
    }
    
    return { allData: interpolated, availableDates: dates };
  }, []);

  // Set initial date from CSV data once loaded
  useEffect(() => {
    if (availableDates.length > 0 && !selectedDate) {
      setSelectedDate(availableDates[0]);
    }
  }, [availableDates, selectedDate]);

  const [params, setParams] = useState({
    soilCo2Release: 0.1,
    plantConsumptionFactor: 0.2,
    ventilationMixingRate: 0.05,
    nightTemp: 15.0
  });

  // Greenhouse Dimensions
  const [width, setWidth] = useState<number>(10);
  const [length, setLength] = useState<number>(20);
  const [height, setHeight] = useState<number>(3);

  // Scenario Controls
  const [events, setEvents] = useState<ControlEvent[]>([]);

  // Playback Control
  const [playbackTime, setPlaybackTime] = useState<number>(0); // 0 to 1439.x minutes (float for smoothness)
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(10); // minutes of simulation per real-world second

  const resultsRef = useRef<any[]>([]);

  const simulatedData = useMemo(() => {
    const dayData = allData.filter(d => d.date === selectedDate);
    if (dayData.length === 0) return [];

    // Pre-calculate moving averages for weather data
    const smoothData = dayData.map((d, index) => {
      let solar = 0, temp = 0, humid = 0, count = 0;
      for (let i = Math.max(0, index - 9); i <= index; i++) {
        solar += dayData[i].solarRadiation;
        temp += dayData[i].temperature;
        humid += dayData[i].humidity;
        count++;
      }
      return { solar: solar / count, temp: temp / count, humid: humid / count };
    });

    // Index events by minute for O(1) lookup
    const eventMap: { [key: number]: ControlEvent[] } = {};
    events.forEach(ev => {
      const min = ev.hour * 60 + ev.minute;
      if (!eventMap[min]) eventMap[min] = [];
      eventMap[min].push(ev);
    });

    // Simulation parameters
    const floorArea = width * length;
    const volume = floorArea * height;
    const surfaceArea = floorArea + 2 * (width * height + length * height);
    
    // Physical constants
    const airDensity = 1.2;
    const specificHeatAir = 1005;
    const thermalMassFactor = 40.0;
    const thermalCapacity = airDensity * specificHeatAir * volume * thermalMassFactor; 
    
    const glassUValue = 6.0; 
    const solarHeatGainEfficiency = 0.4;
    const maxHeatingPowerWatts = 400 * floorArea; 
    
    const es = (t: number) => 6.112 * Math.exp((17.67 * t) / (t + 243.5));
    const calculateDewPoint = (t: number, rh: number) => {
      const gamma = Math.log(rh / 100) + (17.67 * t) / (243.5 + t);
      return (243.5 * gamma) / (17.67 - gamma);
    };

    let currentInsideTemp = dayData[0].temperature;
    let currentInsideRH = dayData[0].humidity;
    let currentInsideCo2 = 400;
    let currentVent = 0;
    let currentHeat = 0;
    let currentCo2Supply = 0;
    
    let cumSolar = 0, cumPhotosynthesis = 0, cumTranspiration = 0;
    let cumTemp = 0, cumOutTemp = 0, cumCo2 = 0, cumHumid = 0;
    let cumHeatingJoules = 0, cumCondensationMinutes = 0;

    const simResults = dayData.map((d, index) => {
      const sData = smoothData[index];
      const minutesToday = d.rawTime;
      
      const minuteEvents = eventMap[minutesToday];
      if (minuteEvents) {
        minuteEvents.forEach(ev => {
          if (ev.type === 'vent') currentVent = ev.value;
          if (ev.type === 'heat') currentHeat = ev.value;
          if (ev.type === 'co2') currentCo2Supply = ev.value;
        });
      }

      const subSteps = 3; 
      const subDT = 60 / subSteps;
      
      let bottleneck = 'none';
      let lightFactor = 0, co2Factor = 0, tempFactorFinal = 0;

      const pMax_sub = params.plantConsumptionFactor * 120;
      const vol_floor_ratio = floorArea / volume;
      const soil_gain = 0.8 * (params.soilCo2Release / 0.1);
      const achMixingFactor = (params.ventilationMixingRate / 0.05);

      // Pre-calculate per-minute invariants
      const achBase = currentVent === 0 ? 1.0 : (currentVent / 10) * 120;
      const ach = achBase * achMixingFactor;
      const es_out = es(sData.temp);
      const q_out = (216.7 * (sData.humid / 100) * es_out) / (sData.temp + 273.15);
      const solar_gain_const = (sData.solar * 277.78) * floorArea * solarHeatGainEfficiency;
      const lightFactor_const = sData.solar / (sData.solar + 0.15);
      const q_gain_rate_solar = (sData.solar * 0.8 * vol_floor_ratio) / 60;

      for (let s = 0; s < subSteps; s++) {
        const conductionWatts = glassUValue * surfaceArea * (currentInsideTemp - sData.temp);
        const ventilationWatts = (volume * airDensity * specificHeatAir * (currentInsideTemp - sData.temp) * ach) / 3600;
        const activeHeatingWatts = (currentHeat / 10) * maxHeatingPowerWatts;
        cumHeatingJoules += activeHeatingWatts * subDT;
        const netPower = solar_gain_const - conductionWatts - ventilationWatts + activeHeatingWatts;
        currentInsideTemp += (netPower * subDT) / thermalCapacity;

        const es_in = es(currentInsideTemp);
        const rh_in_dec = currentInsideRH / 100;
        const vpd_sub = Math.max(0, (es_in * (1 - rh_in_dec)) / 10);
        
        let q_in = (216.7 * rh_in_dec * es_in) / (currentInsideTemp + 273.15);
        const q_gain_rate = q_gain_rate_solar + (vpd_sub * 0.2 * vol_floor_ratio) / 60;
        const q_exchange_rate = (ach * (q_in - q_out)) / 3600;
        q_in = q_in + (q_gain_rate - q_exchange_rate) * subDT;
        currentInsideRH = Math.max(10, Math.min(100, (q_in * (currentInsideTemp + 273.15) / (216.7 * es_in)) * 100));

        tempFactorFinal = Math.max(0, 1 - Math.pow((currentInsideTemp - 25) / 15, 2));
        lightFactor = lightFactor_const;
        co2Factor = currentInsideCo2 / (currentInsideCo2 + 350);
        const p_sub = pMax_sub * lightFactor * co2Factor * tempFactorFinal;
        
        if (sData.solar > 0.05) {
          if (lightFactor <= co2Factor && lightFactor <= tempFactorFinal) bottleneck = 'light';
          else if (co2Factor <= lightFactor && co2Factor <= tempFactorFinal) bottleneck = 'co2';
          else bottleneck = 'temp';
        } else { bottleneck = 'none'; }
        
        const supplyGainPerMin = currentInsideCo2 > 790 ? Math.max(0, 800 - currentInsideCo2) : currentCo2Supply * 1.5;
        const absRate = (p_sub * vol_floor_ratio * 1.8) / 60;
        const exchRate = (ach * (currentInsideCo2 - 400)) / 3600;
        currentInsideCo2 = Math.max(200, currentInsideCo2 + (soil_gain / 60 + supplyGainPerMin / 60 - absRate - exchRate) * subDT);
        if (currentInsideCo2 > 800 && currentCo2Supply > 0) currentInsideCo2 = 800;
      }

      const vpd = Math.max(0, (es(currentInsideTemp) * (1 - currentInsideRH / 100)) / 10);
      const photosynthesis = (params.plantConsumptionFactor * 120) * lightFactor * co2Factor * tempFactorFinal;
      const transpirationPerM2 = (sData.solar * 0.8 + vpd * 0.2); 
      const currentInsideDewPoint = calculateDewPoint(currentInsideTemp, currentInsideRH);
      if ((currentInsideTemp - currentInsideDewPoint) < 1.0) cumCondensationMinutes += 1;

      cumSolar += d.solarRadiation;
      cumPhotosynthesis += photosynthesis * 0.06;
      cumTranspiration += transpirationPerM2;
      cumTemp += currentInsideTemp;
      cumOutTemp += sData.temp;
      cumCo2 += currentInsideCo2;
      cumHumid += currentInsideRH;
      
      return {
        ...d,
        greenhouseTemp: currentInsideTemp,
        greenhouseHumid: currentInsideRH,
        greenhouseDewPoint: currentInsideDewPoint,
        greenhouseCo2: currentInsideCo2,
        photosynthesis: photosynthesis,
        transpiration: transpirationPerM2 * 100,
        transpirationRaw: transpirationPerM2,
        cumulativeSolar: cumSolar,
        cumulativePhotosynthesis: cumPhotosynthesis,
        cumulativeTranspiration: cumTranspiration,
        cumulativeTemp: cumTemp,
        cumulativeOutTemp: cumOutTemp,
        cumulativeCo2: cumCo2,
        cumulativeHumid: cumHumid,
        cumulativeFuel: cumHeatingJoules / 24480000, // 36M * 0.85 = 30.6M -> slightly different factor used before but consistent now
        vpd: vpd,
        outsideCo2: 400,
        ventilationLevel: currentVent,
        heatingLevel: currentHeat,
        co2SupplyLevel: currentCo2Supply,
        bottleneck,
        isCondensationRisk: (currentInsideTemp - currentInsideDewPoint) < 1.0,
        index
      };
    });

    const finalResults = simResults.map(r => ({
      ...r,
      dailyTotalSolar: cumSolar,
      dailyTotalPhotosynthesis: cumPhotosynthesis,
      dailyTotalTranspiration: cumTranspiration,
      dailyTotalTemp: cumTemp,
      dailyTotalOutTemp: cumOutTemp,
      dailyTotalCo2: cumCo2,
      dailyTotalHumid: cumHumid,
      dailyTotalFuel: cumHeatingJoules / 30600000,
      dailyTotalCondensationMinutes: cumCondensationMinutes
    }));

    resultsRef.current = finalResults;
    return finalResults;
  }, [allData, selectedDate, width, length, height, events, params]);

  // Downsampled data for the graphs to prevent 1,440-point rendering lag
  const chartData = useMemo(() => {
    return simulatedData.filter((_, i) => i % 5 === 0);
  }, [simulatedData]);

  const chartSelectedTime = useMemo(() => {
    const nearestIndex = Math.min(simulatedData.length - 1, Math.round(playbackTime / 5) * 5);
    return simulatedData[nearestIndex]?.timeLabel;
  }, [simulatedData, playbackTime]);

  const activeIndex = useMemo(() => {
    if (simulatedData.length === 0) return 0;
    return Math.floor(playbackTime) % (simulatedData.length || 1440);
  }, [simulatedData, playbackTime]);

  const currentlySelectedPoint = useMemo(() => {
    if (simulatedData.length === 0) return null;
    return simulatedData[activeIndex] || simulatedData[0];
  }, [simulatedData, activeIndex]);

  // Playback Loop
  useEffect(() => {
    let interval: any;
    if (isPlaying) {
      interval = setInterval(() => {
        setPlaybackTime(prev => {
          // playbackSpeed is 'minutes per second'
          // We run at 50ms interval (20 ticks per second)
          const increment = playbackSpeed / 20;
          let next = prev + increment;
          if (next >= 1439) {
            setIsPlaying(false);
            return 1439;
          }
          return next;
        });
      }, 50);
    }
    return () => clearInterval(interval);
  }, [isPlaying, playbackSpeed]);

  const optimizePhotosynthesis = () => {
    setIsPlaying(false);
    
    const dayData = allData.filter(d => d.date === selectedDate);
    if (dayData.length === 0) return;

    // Simulation Constants (consistent with simulatedData)
    const floorArea = width * length;
    const volume = floorArea * height;
    const surfaceArea = floorArea + 2 * (width * height + length * height);
    const airDensity = 1.2;
    const specificHeatAir = 1005;
    const thermalMassFactor = 40.0; 
    const thermalCapacity = airDensity * specificHeatAir * volume * thermalMassFactor; 
    const glassUValue = 6.0; 
    const solarHeatGainEfficiency = 0.4;
    const maxHeatingPowerWatts = 400 * floorArea; 
    const es = (t: number) => 6.112 * Math.exp((17.67 * t) / (t + 243.5));

    let state = {
      temp: dayData[0].temperature,
      rh: dayData[0].humidity,
      co2: 400
    };

    let currentVent = 0;
    let currentHeat = 0;
    let currentCo2 = 0;

    const newEvents: ControlEvent[] = [];
    const pMaxNominalLine = params.plantConsumptionFactor * 120;
    const glassU = 6.0;
    const volFloor = floorArea / volume;
    const soilGainMin = 0.8 * (params.soilCo2Release / 0.1);
    
    // Physical constants
    const airDens = 1.2;
    const specHeatAir = 1005;
    const tMassFactor = 40.0;
    const tCap = airDens * specHeatAir * volume * tMassFactor; 

    for (let t = 0; t < 1440; t++) {
      let bestCombo = { v: currentVent, h: currentHeat, c: currentCo2 };
      let bestMetric = -Infinity;
      let bestS = { temp: state.temp, rh: state.rh, co2: state.co2 };

      const subSteps = 5; 
      const subDT = 60 / subSteps;
      const d = dayData[t];
      if (!d) break;

      const isDay = d.solarRadiation > 0.05;
      const vOptions = [currentVent - 1, currentVent, currentVent + 1].filter(v => v >= 0 && v <= 10 && (isDay || v === 0));
      const hOptionsFull = [currentHeat - 1, currentHeat, currentHeat + 1].filter(h => h >= 0 && h <= 10);
      const cOptionsFull = [currentCo2 - 1, currentCo2, currentCo2 + 1].filter(c => c >= 0 && c <= 10);

      const solarWatts = (d.solarRadiation * 277.78 * floorArea * 0.4);
      const qOutBase = (216.7 * (d.humidity / 100) * es(d.temperature)) / (d.temperature + 273.15);

      for (const v of vOptions) {
        const hOptions = v > 0 ? [0] : hOptionsFull;
        const cOptions = v > 0 ? [0] : cOptionsFull;
        const ach = (v === 0 ? 1.0 : (v / 10) * 120) * (params.ventilationMixingRate / 0.05);

        for (const h of hOptions) {
          const hWatts = (h / 10) * maxHeatingPowerWatts;
          for (const c of cOptions) {
            let sTemp = state.temp, sRh = state.rh, sCo2 = state.co2;
            let sumP = 0;

            for (let s = 0; s < subSteps; s++) {
              const netP = solarWatts - (glassU * surfaceArea * (sTemp - d.temperature)) - (volume * airDens * specHeatAir * (sTemp - d.temperature) * ach / 3600) + hWatts;
              sTemp += (netP * subDT) / tCap;

              const esIn = es(sTemp);
              let qIn = (216.7 * (sRh / 100) * esIn) / (sTemp + 273.15);
              const vpd = Math.max(0, (esIn * (1 - sRh / 100)) / 10);
              const transpRate = (d.solarRadiation * 0.8 + vpd * 0.2);
              qIn += ((transpRate * volFloor / 60) - (ach * (qIn - qOutBase) / 3600)) * subDT;
              sRh = Math.max(10, Math.min(100, (qIn * (sTemp + 273.15) / (216.7 * esIn)) * 100));

              const tFactor = Math.max(0, 1 - Math.pow((sTemp - 25) / 15, 2));
              const p = pMaxNominalLine * (d.solarRadiation / (d.solarRadiation + 0.15)) * (sCo2 / (sCo2 + 350)) * tFactor;
              sumP += p * subDT;

              const sup = sCo2 > 790 ? Math.max(0, 800 - sCo2) : c * 1.5;
              sCo2 = Math.max(200, sCo2 + (soilGainMin / 60 + sup / 60 - (p * volFloor * 1.8 / 60) - (ach * (sCo2 - 400) / 3600)) * subDT);
              if (sCo2 > 800 && c > 0) sCo2 = 800;
            }

            let metric = isDay ? (sumP - (v * 0.001 + h * 0.001 + c * 0.001)) : (-Math.abs(sTemp - params.nightTemp) - (v * 0.1 + h * 0.01));
            if (metric > bestMetric) {
              bestMetric = metric; bestCombo = { v, h, c }; bestS = { temp: sTemp, rh: sRh, co2: sCo2 };
            }
          }
        }
      }
      if (t === 0 || bestCombo.v !== currentVent || bestCombo.h !== currentHeat || bestCombo.c !== currentCo2) {
        const hour = Math.floor(t / 60); const minute = t % 60;
        if (bestCombo.v !== currentVent) newEvents.push({ id: `opt-v-${t}`, hour, minute, type: 'vent', value: bestCombo.v });
        if (bestCombo.h !== currentHeat) newEvents.push({ id: `opt-h-${t}`, hour, minute, type: 'heat', value: bestCombo.h });
        if (bestCombo.c !== currentCo2) newEvents.push({ id: `opt-c-${t}`, hour, minute, type: 'co2', value: bestCombo.c });
      }
      currentVent = bestCombo.v; currentHeat = bestCombo.h; currentCo2 = bestCombo.c; state = bestS;
    }
    setEvents(newEvents);
    setPlaybackTime(0);
  };

  const handleAdjustValue = (type: 'vent' | 'heat' | 'co2', delta: number) => {
    const hours = Math.floor(playbackTime / 60);
    const minutes = playbackTime % 60;
    
    // Find current set value for this time
    const currentPoint = resultsRef.current.find(d => d.rawTime === playbackTime);
    let val = 0;
    if (currentPoint) {
      if (type === 'vent') val = currentPoint.ventilationLevel ?? 0;
      if (type === 'heat') val = currentPoint.heatingLevel ?? 0;
      if (type === 'co2') val = currentPoint.co2SupplyLevel ?? 0;
    }
    
    const newVal = Math.max(0, Math.min(10, val + delta));
    
    // Add/Update event for this specific minute
    const newEvents = events.filter(e => !(e.hour === hours && e.minute === minutes && e.type === type));
    setEvents([...newEvents, {
        id: Math.random().toString(36).substr(2, 9),
        hour: hours,
        minute: minutes,
        type,
        value: newVal
    }]);
  };

  const resetScenario = () => {
    setEvents([]);
    setPlaybackTime(0);
    setIsPlaying(false);
  };

  return (
    <div className="min-h-screen font-sans p-4 lg:p-6 flex flex-col gap-4 max-w-[1800px] mx-auto text-slate-900 bg-slate-50/50">
      {/* Compact Header */}
      <header className="flex flex-col gap-4 pb-6 border-b border-slate-200">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="flex flex-wrap items-center gap-8">
            <div className="relative">
              <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-lg blur opacity-25" />
              <div className="relative flex items-center gap-3 bg-white px-4 py-2 rounded-lg border border-slate-100 shadow-sm">
                <div className="bg-emerald-500 p-2 rounded-md text-white">
                  <Activity size={24} strokeWidth={3} />
                </div>
                <h1 className="text-3xl font-black tracking-tighter text-slate-900 leading-none uppercase">
                  GREENHOUSE<span className="text-emerald-500 text-glow-emerald">.SIM</span>
                </h1>
                <div className="h-8 w-[1px] bg-slate-200 mx-2" />
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] vertical-text">温室シミュレータ</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="glass-card p-1 rounded-lg flex gap-1 bg-white/60">
                <button onClick={() => setActiveTab('graph')} className={`px-4 py-1.5 rounded-md text-[10px] uppercase tracking-widest font-black transition-all ${activeTab === 'graph' ? 'bg-emerald-500 text-white shadow-md' : 'text-slate-400 hover:text-slate-900'}`}>モニタ</button>
                <button onClick={() => setActiveTab('data')} className={`px-4 py-1.5 rounded-md text-[10px] uppercase tracking-widest font-black transition-all ${activeTab === 'data' ? 'bg-emerald-500 text-white shadow-md' : 'text-slate-400 hover:text-slate-900'}`}>履歴</button>
              </div>
              <div className="glass-card py-1.5 px-4 rounded-lg flex items-center gap-2 bg-white/60 border border-white/50 text-[10px] font-bold">
                <Calendar size={14} className="text-emerald-500" />
                <select 
                  value={selectedDate} 
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-transparent outline-none cursor-pointer text-slate-800"
                >
                  {availableDates.map(date => (
                    <option key={date} value={date} className="bg-white">{date}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
              <div className="relative group">
                <input 
                  id="time-input"
                  type="text"
                  value={currentlySelectedPoint?.timeLabel || "00:00"}
                  onChange={(e) => {
                    let val = e.target.value.replace(/[^0-9]/g, '');
                    if (val.length > 4) val = val.slice(0, 4);
                    let h = 0, m = 0;
                    if (val.length >= 1) {
                      if (val.length <= 2) { h = parseInt(val); } else {
                        h = parseInt(val.slice(0, val.length - 2));
                        m = parseInt(val.slice(val.length - 2));
                      }
                    }
                    if (h < 24 && m < 60) { setPlaybackTime(h * 60 + m); }
                  }}
                  className="text-5xl font-mono font-bold tracking-tighter text-slate-900 bg-transparent border-none focus:outline-none text-center w-[160px] cursor-text leading-none"
                  title="時刻入力 (例: 9 または 930)"
                />
                <div className="absolute -bottom-1 left-0 right-0 h-1 bg-emerald-500/20 group-focus-within:bg-emerald-500 transition-all scale-x-0 group-focus-within:scale-x-100" />
              </div>
              
              <div className="flex gap-2 items-center">
                <div className="flex items-center gap-1 bg-white/40 glass-card px-2 py-1 rounded-lg border border-white/60">
                  <span className="text-[8px] font-black text-slate-400 uppercase">速度</span>
                  <select 
                    value={playbackSpeed} 
                    onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                    className="bg-transparent text-[10px] font-bold text-slate-700 outline-none cursor-pointer"
                  >
                    <option value={10}>x10</option>
                    <option value={30}>x30</option>
                    <option value={60}>x60</option>
                    <option value={120}>x120</option>
                    <option value={300}>x300</option>
                  </select>
                </div>
              <button 
                id="simulation-toggle"
                data-testid="simulation-toggle"
                onClick={() => setIsPlaying(!isPlaying)}
                className={`px-6 py-2 rounded-lg font-black uppercase tracking-[0.1em] text-[10px] transition-all shadow-md ${isPlaying ? 'bg-red-500 text-white' : 'bg-emerald-600 text-white'}`}
              >
                {isPlaying ? '停止' : '再生'}
              </button>
              <button 
                id="simulation-reset"
                data-testid="simulation-reset"
                onClick={resetScenario}
                className="px-4 py-2 glass-card rounded-lg flex items-center justify-center gap-2 text-slate-500 hover:text-red-600 transition-all text-[10px] font-black uppercase tracking-widest shadow-sm"
              >
                <RotateCcw size={12} /> リセット
              </button>
            </div>
          </div>
        </div>
      </header>




        {activeTab === 'graph' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Compact Sidebar */}
            <aside className="lg:col-span-3 space-y-4">
              <div className="glass-panel rounded-3xl p-5 space-y-6 shadow-md border border-white/40">
                <section className="space-y-3">
                  <h3 className="text-xs font-black tracking-widest text-emerald-500 uppercase">制御・設定</h3>
                  <div className="space-y-2">
                    {Object.entries(params).map(([key, value]) => {
                      if (key === 'nightTemp') return null;
                      return (
                        <div key={key} className="glass-card rounded-xl px-4 py-3 flex items-center justify-between group border border-white/60 bg-white/40">
                          <span className="text-[10px] font-bold text-slate-500 uppercase">
                            {key === 'soilCo2Release' ? '土からのCO2' : 
                             key === 'plantConsumptionFactor' ? '植物の元気さ' : 
                             key === 'ventilationMixingRate' ? '風の通りやすさ' : key}
                          </span>
                          <div className="flex items-center gap-3">
                            <input 
                              type="range" 
                              min={0} max={key.includes('Factor') ? 2 : 100} 
                              step={0.1}
                              value={value} 
                              onChange={(e) => setParams(p => ({ ...p, [key]: parseFloat(e.target.value) }))}
                              className="w-16 h-1.5 accent-emerald-500 appearance-none bg-slate-200 rounded-full cursor-pointer"
                            />
                            <span className="text-xs font-mono font-black text-slate-900 w-6 text-right">{value}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="space-y-3">
                   <h3 className="text-xs font-black tracking-widest text-slate-500 uppercase">構造</h3>
                   <div className="grid grid-cols-3 gap-2">
                    {[
                      { l: '幅', v: width, s: setWidth },
                      { l: '奥', v: length, s: setLength },
                      { l: '高', v: height, s: setHeight },
                    ].map(dim => (
                      <div key={dim.l} className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase text-center block tracking-widest">{dim.l}</label>
                        <input 
                          type="number" 
                          value={dim.v} 
                          onChange={(e) => dim.s(Number(e.target.value))}
                          className="w-full glass-card border-none rounded-lg py-2 text-xs font-black text-center focus:bg-white transition-all outline-none text-slate-900 shadow-inner"
                        />
                      </div>
                    ))}
                  </div>
                </section>

                <div className="glass-card rounded-2xl p-4 space-y-4 border-l-4 border-emerald-500 bg-white/70 shadow-md">
                   <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">換気開度</span>
                        <Wind size={16} className="text-emerald-500" />
                      </div>
                      <div className="flex items-center justify-between bg-white/40 p-1.5 rounded-lg border border-slate-100">
                        <button 
                          id="vent-minus"
                          data-testid="vent-minus"
                          onClick={() => handleAdjustValue('vent', -1)}
                          className="w-8 h-8 rounded-md flex items-center justify-center bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 transition-all text-sm font-black"
                        >
                          -
                        </button>
                        <div className="flex items-baseline gap-1">
                          <span id="vent-value" data-testid="vent-value" className="text-2xl font-black text-slate-900">{currentlySelectedPoint?.ventilationLevel?.toFixed(0) || "0"}</span>
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">段</span>
                        </div>
                        <button 
                          id="vent-plus"
                          data-testid="vent-plus"
                          onClick={() => handleAdjustValue('vent', 1)}
                          className="w-8 h-8 rounded-md flex items-center justify-center bg-emerald-500 text-white hover:bg-emerald-600 transition-all shadow-md shadow-emerald-500/20"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                   </div>

                   <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">暖房出力</span>
                        <Flame size={16} className="text-orange-500" />
                      </div>
                      <div className="flex items-center justify-between bg-white/40 p-1.5 rounded-lg border border-slate-100">
                        <button 
                          id="heat-minus"
                          data-testid="heat-minus"
                          onClick={() => handleAdjustValue('heat', -1)}
                          className="w-8 h-8 rounded-md flex items-center justify-center bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 transition-all text-sm font-black"
                        >
                          -
                        </button>
                        <div className="flex items-baseline gap-1">
                          <span id="heat-value" data-testid="heat-value" className="text-2xl font-black text-slate-900">{currentlySelectedPoint?.heatingLevel?.toFixed(0) || "0"}</span>
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">段</span>
                        </div>
                        <button 
                          id="heat-plus"
                          data-testid="heat-plus"
                          onClick={() => handleAdjustValue('heat', 1)}
                          className="w-8 h-8 rounded-md flex items-center justify-center bg-orange-500 text-white hover:bg-orange-600 transition-all shadow-md shadow-orange-500/20"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                   </div>

                   <div className="space-y-1.5 pt-1 border-t border-slate-100/50">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">夜間保持温度</span>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-mono font-black text-blue-600">{params.nightTemp}°C</span>
                          <Thermometer size={12} className="text-blue-400" />
                        </div>
                      </div>
                      <input 
                        type="range" 
                        min={5} max={25} 
                        step={0.5}
                        value={params.nightTemp} 
                        onChange={(e) => setParams(p => ({ ...p, nightTemp: parseFloat(e.target.value) }))}
                        className="w-full h-1.5 accent-blue-500 appearance-none bg-slate-200 rounded-full cursor-pointer"
                      />
                   </div>

                   <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">CO2供給設定</span>
                        <Activity size={16} className="text-purple-500" />
                      </div>
                      <div className="flex items-center justify-between bg-white/40 p-1.5 rounded-lg border border-slate-100">
                        <button 
                          id="co2-minus"
                          data-testid="co2-minus"
                          onClick={() => handleAdjustValue('co2', -1)}
                          className="w-8 h-8 rounded-md flex items-center justify-center bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 transition-all text-sm font-black"
                        >
                          -
                        </button>
                        <div className="flex items-baseline gap-1">
                          <span id="co2-value" data-testid="co2-value" className="text-2xl font-black text-slate-900">{currentlySelectedPoint?.co2SupplyLevel?.toFixed(0) || "0"}</span>
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">段</span>
                        </div>
                        <button 
                          id="co2-plus"
                          data-testid="co2-plus"
                          onClick={() => handleAdjustValue('co2', 1)}
                          className="w-8 h-8 rounded-md flex items-center justify-center bg-purple-500 text-white hover:bg-purple-600 transition-all shadow-md shadow-purple-500/20"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                   </div>
                </div>

                <button 
                  id="optimize-btn"
                  onClick={optimizePhotosynthesis}
                  className="w-full mt-4 py-4 rounded-2xl bg-gradient-to-br from-purple-600 to-emerald-600 text-white font-black uppercase tracking-[0.2em] text-[11px] shadow-lg shadow-purple-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                >
                  <Activity size={18} className="animate-pulse" />
                  光合成最適化
                </button>
              </div>
            </aside>

            {/* 統計マトリックス */}
            <main className="lg:col-span-9 space-y-4">
              
              {/* 高密度ステータスマトリックス */}
              <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-9 gap-4">
                 {[
                    { id: 'stat-greenhouse-temp', label: '内気温', val: currentlySelectedPoint?.greenhouseTemp?.toFixed(1) || '0.0', numericVal: currentlySelectedPoint?.greenhouseTemp || 0, min: 0, max: 45, unit: '°C', color: 'text-emerald-700', glow: 'text-glow-emerald', subVal: ((currentlySelectedPoint?.dailyTotalTemp || 0) / 60).toFixed(0), subNumericVal: (currentlySelectedPoint?.dailyTotalTemp || 0) / 60, subMin: 0, subMax: 720, subUnit: '°h', subLabel: '1日積算', detail: `露点: ${currentlySelectedPoint?.greenhouseDewPoint?.toFixed(1) || '0.0'}°` },
                    { id: 'stat-outside-temp', label: '外気温', val: currentlySelectedPoint?.temperature?.toFixed(1) || '0.0', numericVal: currentlySelectedPoint?.temperature || 0, min: 0, max: 45, unit: '°C', color: 'text-slate-600', subVal: ((currentlySelectedPoint?.dailyTotalOutTemp || 0) / 60).toFixed(0), subNumericVal: (currentlySelectedPoint?.dailyTotalOutTemp || 0) / 60, subMin: 0, subMax: 720, subUnit: '°h', subLabel: '1日積算', detail: `露点: ${currentlySelectedPoint?.dewPoint?.toFixed(1) || '0.0'}°` },
                    { id: 'stat-humidity', label: '湿度', val: currentlySelectedPoint?.greenhouseHumid?.toFixed(0) || '0.0', numericVal: currentlySelectedPoint?.greenhouseHumid || 0, min: 0, max: 100, unit: '%', color: 'text-blue-700', glow: 'text-glow-blue', subVal: ((currentlySelectedPoint?.dailyTotalHumid || 0) / 1440).toFixed(0), subNumericVal: (currentlySelectedPoint?.dailyTotalHumid || 0) / 1440, subMin: 0, subMax: 100, subUnit: '%', subLabel: '1日平均', detail: `飽差: ${currentlySelectedPoint?.vpd?.toFixed(2) || '0.00'}` },
                    { id: 'stat-dewpoint', label: '露点', val: currentlySelectedPoint?.greenhouseDewPoint?.toFixed(1) || '0.0', numericVal: currentlySelectedPoint?.greenhouseDewPoint || 0, min: 0, max: 45, unit: '°C', color: 'text-sky-700', glow: 'text-glow-sky', subVal: currentlySelectedPoint?.dailyTotalCondensationMinutes?.toFixed(0) || '0', subNumericVal: currentlySelectedPoint?.dailyTotalCondensationMinutes || 0, subMin: 0, subMax: 1440, subUnit: '分', subLabel: '結露時間', detail: `差: ${(currentlySelectedPoint?.greenhouseTemp - currentlySelectedPoint?.greenhouseDewPoint).toFixed(1)}°` },
                    { id: 'stat-co2', label: 'CO2', val: currentlySelectedPoint?.greenhouseCo2?.toFixed(0) || '0', numericVal: currentlySelectedPoint?.greenhouseCo2 || 0, min: 0, max: 1500, unit: 'ppm', color: 'text-purple-700', glow: 'text-glow-purple', subVal: ((currentlySelectedPoint?.dailyTotalCo2 || 0) / 1440).toFixed(0), subNumericVal: (currentlySelectedPoint?.dailyTotalCo2 || 0) / 1440, subMin: 0, subMax: 1000, subUnit: 'ppm', subLabel: '1日平均', detail: `供給: ${currentlySelectedPoint?.co2SupplyLevel || 0}段` },
                    { id: 'stat-heating', label: '暖房出力', val: currentlySelectedPoint?.heatingLevel?.toFixed(0) || '0', numericVal: currentlySelectedPoint?.heatingLevel || 0, min: 0, max: 10, unit: '段', color: 'text-orange-600', glow: 'text-glow-orange', subVal: (currentlySelectedPoint?.dailyTotalFuel || 0).toFixed(2), subNumericVal: currentlySelectedPoint?.dailyTotalFuel || 0, subMin: 0, subMax: 100, subUnit: 'L', subLabel: '使用燃料', detail: `出力: ${((currentlySelectedPoint?.heatingLevel || 0) / 10 * 400 * (width * length) / 1000).toFixed(1)}kW` },
                    { id: 'stat-p-rate', label: '光合成', val: currentlySelectedPoint?.photosynthesis?.toFixed(1) || '0.0', numericVal: currentlySelectedPoint?.photosynthesis || 0, min: 0, max: 35, unit: 'µmol', color: 'text-lime-700', glow: 'text-glow-lime', subVal: currentlySelectedPoint?.dailyTotalPhotosynthesis?.toFixed(0) || '0', subNumericVal: currentlySelectedPoint?.dailyTotalPhotosynthesis || 0, subMin: 0, subMax: 400, subUnit: 'mmol', subLabel: '1日積算', detail: `mmol/m²/day` },
                    { id: 'stat-transpiration', label: '蒸散', val: currentlySelectedPoint?.transpirationRaw?.toFixed(1) || '0.0', numericVal: currentlySelectedPoint?.transpirationRaw || 0, min: 0, max: 30, unit: 'g/m²', color: 'text-cyan-700', glow: 'text-glow-cyan', subVal: currentlySelectedPoint?.dailyTotalTranspiration?.toFixed(0) || '0', subNumericVal: currentlySelectedPoint?.dailyTotalTranspiration || 0, subMin: 0, subMax: 3000, subUnit: 'g/m²', subLabel: '1日積算', detail: `g/m²/day` },
                    { id: 'stat-solar', label: '日射量', val: currentlySelectedPoint?.solarRadiation?.toFixed(2) || '0.00', numericVal: currentlySelectedPoint?.solarRadiation || 0, min: 0, max: 3.5, unit: 'MJ', color: 'text-amber-700', glow: 'text-glow-amber', subVal: currentlySelectedPoint?.dailyTotalSolar?.toFixed(1) || '0.0', subNumericVal: currentlySelectedPoint?.dailyTotalSolar || 0, subMin: 0, subMax: 25, subUnit: 'MJ', subLabel: '1日積算', detail: `MJ/m²/day` },
                 ].map((stat, i) => (

                    <motion.div 
                        key={i}
                        id={stat.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.05 }}
                        className="glass-panel rounded-2xl p-3 flex flex-col justify-between h-[120px] shadow-sm border border-white/40"
                    >
                        <span className="text-[9px] font-black tracking-[0.1em] text-slate-500 uppercase leading-none">{stat.label}</span>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <div className="flex flex-col">
                              <span className="text-[7px] font-black text-slate-400 uppercase tracking-tighter leading-none mb-0.5">現在値</span>
                              <div className="flex items-baseline gap-1">
                                <span id={`${stat.id}-value`} className={`text-xl font-black tracking-tighter ${stat.color} ${stat.glow || ''}`}>{stat.val}</span>
                                <span className="text-[8px] font-bold text-slate-400">{stat.unit}</span>
                              </div>
                            </div>
                            <Gauge value={stat.numericVal} min={stat.min} max={stat.max} colorClass={stat.color} />
                          </div>
                          <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-2">
                            <div className="flex flex-col">
                              <span className="text-[7px] font-black text-slate-400 uppercase tracking-tighter leading-none mb-0.5">{stat.subLabel}</span>
                              <div className="flex items-baseline gap-1">
                                <span className={`text-xl font-black tracking-tighter ${stat.color} ${stat.glow || ''}`}>{stat.subVal}</span>
                                <span className="text-[8px] font-bold text-slate-400">{stat.subUnit}</span>
                              </div>
                            </div>
                            <Gauge value={stat.subNumericVal} min={stat.subMin} max={stat.subMax} colorClass={stat.color} />
                          </div>
                        </div>
                        <div className="text-[7px] text-slate-400 font-medium uppercase tracking-tight truncate border-t border-slate-100 pt-1">{stat.detail}</div>
                      </motion.div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                   {/* 1. 温度推移グラフ */}
                  <div className="glass-panel rounded-2xl p-4 flex flex-col h-[200px] relative overflow-hidden group border border-white/40">
                    <div className="absolute top-0 right-0 p-4 flex gap-2 text-[8px] font-black uppercase tracking-widest text-slate-400">
                        <div className="flex items-center gap-1"><div className="w-2 h-2 bg-red-500/10" /> 抑制</div>
                        <div className="flex items-center gap-1"><div className="w-2 h-2 bg-blue-500/20 border border-blue-400 border-dashed" /> 結露</div>
                        <div className="flex items-center gap-1"><div className="w-2 h-0.5 bg-emerald-500" /> ハウス</div>
                        <div className="flex items-center gap-1"><div className="w-2 h-0.5 bg-sky-400" /> 露点</div>
                        <div className="flex items-center gap-1"><div className="w-2 h-0.5 bg-slate-400" /> 外気</div>
                    </div>
                    <h3 className="text-[10px] font-black tracking-widest text-emerald-500 uppercase mb-4">温度</h3>
                    <div className="flex-grow">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart 
                              data={chartData} 
                              margin={{ top: 10, right: 10, left: 40, bottom: 0 }} 
                              onClick={(e) => {
                                if (e && e.activeTooltipIndex !== undefined) {
                                  const point = chartData[e.activeTooltipIndex];
                                  if (point) { setPlaybackTime(point.rawTime); setIsPlaying(false); }
                                }
                              }}
                            >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey="timeLabel" hide />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} domain={['auto', 'auto']} width={40} />
                                <YAxis yAxisId="highlight" hide domain={[0, 1]} />
                                <Tooltip content={<CustomTooltip />} />
                                
                                {/* Modern Glowing Playback Cursor */}
                                <ReferenceLine x={chartSelectedTime} stroke="#10b981" strokeWidth={4} strokeOpacity={0.15} />
                                <ReferenceLine x={chartSelectedTime} stroke="#10b981" strokeWidth={1} strokeOpacity={0.8} />
                                
                                <ReferenceDot 
                                  x={chartSelectedTime} 
                                  y={currentlySelectedPoint?.greenhouseTemp} 
                                  r={4} 
                                  fill="#10b981" 
                                  stroke="white" 
                                  strokeWidth={2}
                                />
                                
                                <Area yAxisId="highlight" type="monotone" dataKey={(d: any) => d.bottleneck === 'temp' ? 1 : 0} name="highlight-temp" stroke="none" fill="rgba(239, 68, 68, 0.15)" isAnimationActive={false} />
                                <Area yAxisId="highlight" type="monotone" dataKey={(d: any) => d.isCondensationRisk ? 1 : 0} name="highlight-condensation" stroke="#3b82f6" strokeWidth={0.5} strokeDasharray="2 2" fill="url(#patternCondensation)" isAnimationActive={false} />
                                <Area type="monotone" dataKey="temperature" stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 3" fill="none" dot={<CustomDot />} activeDot={<ActivePlaybackDot />} isAnimationActive={false} name="外気" />
                                <Area type="monotone" dataKey="greenhouseDewPoint" stroke="#38bdf8" strokeWidth={1} fill="none" dot={false} activeDot={<ActivePlaybackDot />} isAnimationActive={false} name="露点温度" />
                                <Area type="monotone" dataKey="greenhouseTemp" stroke="#10b981" strokeWidth={2.5} fill="url(#gradEmerald)" dot={false} activeDot={<ActivePlaybackDot />} isAnimationActive={false} name="ハウス内" />
                                <defs>
                                    <linearGradient id="gradEmerald" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.15} />
                                        <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                                    </linearGradient>
                                    <pattern id="patternCondensation" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                                        <rect width="2" height="4" fill="rgba(59, 130, 246, 0.3)" />
                                    </pattern>
                                </defs>
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                  </div>

                  {/* 2. 湿度バランス */}
                  <div className="glass-panel rounded-2xl p-4 h-[200px] flex flex-col relative overflow-hidden border border-white/40">
                    <h3 className="text-[10px] font-black tracking-widest text-blue-500 uppercase mb-4">湿度</h3>
                    <div className="flex-grow">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart 
                              data={chartData} 
                              margin={{ top: 0, right: 10, left: 40, bottom: 0 }} 
                              onClick={(e) => {
                                if (e && e.activeTooltipIndex !== undefined) {
                                  const point = chartData[e.activeTooltipIndex];
                                  if (point) { setPlaybackTime(point.rawTime); setIsPlaying(false); }
                                }
                              }}
                            >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey="timeLabel" hide />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#475569', fontWeight: 'bold' }} domain={[0, 100]} width={40} />
                                <Tooltip content={<CustomTooltip />} />
                                
                                <ReferenceLine x={chartSelectedTime} stroke="#3b82f6" strokeWidth={4} strokeOpacity={0.15} />
                                <ReferenceLine x={chartSelectedTime} stroke="#3b82f6" strokeWidth={1} strokeOpacity={0.8} />
                                
                                <ReferenceDot 
                                  x={chartSelectedTime} 
                                  y={currentlySelectedPoint?.greenhouseHumid} 
                                  r={4} 
                                  fill="#3b82f6" 
                                  stroke="white" 
                                  strokeWidth={2}
                                />
                                
                                <Area type="monotone" dataKey="greenhouseHumid" stroke="#3b82f6" strokeWidth={3} fill="rgba(59, 130, 246, 0.2)" dot={false} activeDot={<ActivePlaybackDot />} isAnimationActive={false} name="ハウス内湿度" />
                                <Area type="monotone" dataKey="humidity" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 4" fill="none" dot={<CustomDot />} activeDot={<ActivePlaybackDot />} isAnimationActive={false} name="外気湿度 (実測)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                  </div>

                  {/* 3. CO2濃度推移グラフ */}
                  <div className="glass-panel rounded-2xl p-4 flex flex-col h-[200px] relative overflow-hidden group border border-white/40">
                    <div className="absolute top-0 right-0 p-4 flex gap-2 text-[8px] font-black uppercase tracking-widest text-slate-400">
                        <div className="flex items-center gap-1"><div className="w-2 h-0.5 bg-purple-500" /> CO2 濃度</div>
                    </div>
                    <h3 className="text-[10px] font-black tracking-widest text-purple-500 uppercase mb-4">CO2</h3>
                    <div className="flex-grow">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart 
                              data={chartData} 
                              margin={{ top: 10, right: 10, left: 40, bottom: 0 }} 
                              onClick={(e) => {
                                if (e && e.activeTooltipIndex !== undefined) {
                                  const point = chartData[e.activeTooltipIndex];
                                  if (point) { setPlaybackTime(point.rawTime); setIsPlaying(false); }
                                }
                              }}
                            >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey="timeLabel" hide />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} domain={['auto', 'auto']} width={40} />
                                <YAxis yAxisId="highlight" hide domain={[0, 1]} />
                                <Tooltip content={<CustomTooltip />} />
                                
                                <ReferenceLine x={chartSelectedTime} stroke="#a855f7" strokeWidth={4} strokeOpacity={0.15} />
                                <ReferenceLine x={chartSelectedTime} stroke="#a855f7" strokeWidth={1} strokeOpacity={0.8} />
                                
                                <ReferenceDot 
                                  x={chartSelectedTime} 
                                  y={currentlySelectedPoint?.greenhouseCo2} 
                                  r={4} 
                                  fill="#a855f7" 
                                  stroke="white" 
                                  strokeWidth={2}
                                />
                                
                                <Area yAxisId="highlight" type="monotone" dataKey={(d: any) => d.bottleneck === 'co2' ? 1 : 0} name="highlight-co2" stroke="none" fill="rgba(239, 68, 68, 0.15)" isAnimationActive={false} />
                                <Area type="monotone" dataKey="greenhouseCo2" stroke="#a855f7" strokeWidth={2.5} fill="url(#gradPurple)" dot={false} activeDot={<ActivePlaybackDot />} isAnimationActive={false} name="CO2" />
                                <defs>
                                    <linearGradient id="gradPurple" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#a855f7" stopOpacity={0.15} />
                                        <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                  </div>

                  {/* 4. 日射・雲量推移 */}
                  <div className="glass-panel rounded-2xl p-4 h-[200px] flex flex-col relative overflow-hidden border border-white/40">
                    <h3 className="text-[10px] font-black tracking-widest text-amber-500 uppercase mb-4">日射量</h3>
                    <div className="flex-grow">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart 
                              data={chartData} 
                              margin={{ top: 0, right: 10, left: 40, bottom: 0 }} 
                              onClick={(e) => {
                                if (e && e.activeTooltipIndex !== undefined) {
                                  const point = chartData[e.activeTooltipIndex];
                                  if (point) { setPlaybackTime(point.rawTime); setIsPlaying(false); }
                                }
                              }}
                            >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey="timeLabel" hide />
                                <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#f59e0b', fontWeight: 'bold' }} domain={['auto', 'auto']} width={40} />
                                <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 'bold' }} domain={[0, 10]} />
                                <YAxis yAxisId="highlight" hide domain={[0, 1]} />
                                <Tooltip content={<CustomTooltip />} />
                                
                                <ReferenceLine x={chartSelectedTime} stroke="#f59e0b" strokeWidth={4} strokeOpacity={0.15} />
                                <ReferenceLine x={chartSelectedTime} stroke="#f59e0b" strokeWidth={1} strokeOpacity={0.8} />
                                
                                <ReferenceDot 
                                  yAxisId="left"
                                  x={chartSelectedTime} 
                                  y={currentlySelectedPoint?.solarRadiation} 
                                  r={4} 
                                  fill="#f59e0b" 
                                  stroke="white" 
                                  strokeWidth={2}
                                />
                                
                                <Area yAxisId="highlight" type="monotone" dataKey={(d: any) => d.bottleneck === 'light' ? 1 : 0} name="highlight-light" stroke="none" fill="rgba(239, 68, 68, 0.15)" isAnimationActive={false} />
                                <Area yAxisId="left" type="monotone" dataKey="clearSkyRadiation" stroke="#fbbf24" strokeWidth={1.5} strokeDasharray="4 4" fill="none" dot={false} activeDot={<ActivePlaybackDot />} isAnimationActive={false} name="晴天日射" />
                                <Area yAxisId="left" type="monotone" dataKey="solarRadiation" stroke="#f59e0b" strokeWidth={3} fill="rgba(245, 158, 11, 0.15)" dot={<CustomDot />} activeDot={<ActivePlaybackDot />} isAnimationActive={false} name="実測日射量" />
                                <Bar yAxisId="right" dataKey="cloudCover" fill="#e2e8f0" barSize={1} isAnimationActive={false} name="雲量" />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                  </div>

                  {/* 5. 光合成速度推移グラフ */}
                  <div className="glass-panel rounded-2xl p-4 flex flex-col h-[200px] relative overflow-hidden group border border-white/40">
                    <div className="absolute top-0 right-0 p-4 flex gap-2 text-[8px] font-black uppercase tracking-widest text-slate-400">
                        <div className="flex items-center gap-1"><div className="w-2 h-0.5 bg-lime-500" /> 光合成</div>
                        <div className="flex items-center gap-1"><div className="w-2 h-0.5 bg-cyan-500" /> 蒸散</div>
                    </div>
                    <h3 className="text-[10px] font-black tracking-widest text-lime-600 uppercase mb-4">光合成速度</h3>
                    <div className="flex-grow">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart 
                              data={simulatedData} 
                              margin={{ top: 10, right: 10, left: 50, bottom: 0 }} 
                              onClick={(e) => {
                                if (e && e.activeTooltipIndex !== undefined) {
                                  const point = simulatedData[e.activeTooltipIndex];
                                  if (point) { setPlaybackTime(point.rawTime); setIsPlaying(false); }
                                }
                              }}
                            >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey="timeLabel" hide />
                                <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} domain={['auto', 'auto']} width={40} />
                                <YAxis yAxisId="right" orientation="left" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#06b6d4' }} domain={['auto', 'auto']} width={40} />
                                <YAxis yAxisId="highlight" hide domain={[0, 1]} />
                                <Tooltip content={<CustomTooltip />} />
                                
                                <ReferenceLine x={currentlySelectedPoint?.timeLabel} stroke="#84cc16" strokeWidth={4} strokeOpacity={0.15} />
                                <ReferenceLine x={currentlySelectedPoint?.timeLabel} stroke="#84cc16" strokeWidth={1} strokeOpacity={0.8} />
                                
                                <ReferenceDot 
                                  yAxisId="left"
                                  x={currentlySelectedPoint?.timeLabel} 
                                  y={currentlySelectedPoint?.photosynthesis} 
                                  r={4} 
                                  fill="#84cc16" 
                                  stroke="white" 
                                  strokeWidth={2}
                                />
                                
                                <Area yAxisId="highlight" type="monotone" dataKey={(d: any) => d.bottleneck !== 'none' ? 1 : 0} name="highlight-any" stroke="none" fill="rgba(239, 68, 68, 0.05)" isAnimationActive={false} />
                                <Area yAxisId="right" type="monotone" dataKey="transpiration" stroke="#06b6d4" strokeWidth={1.5} strokeDasharray="3 3" fill="none" dot={false} activeDot={<ActivePlaybackDot />} isAnimationActive={false} name="蒸散" />
                                <Area yAxisId="left" type="monotone" dataKey="photosynthesis" stroke="#84cc16" strokeWidth={2.5} fill="url(#gradLime)" dot={false} activeDot={<ActivePlaybackDot />} isAnimationActive={false} name="光合成速度" />
                                <defs>
                                    <linearGradient id="gradLime" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#84cc16" stopOpacity={0.15} />
                                        <stop offset="100%" stopColor="#84cc16" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                  </div>

                  {/* 6. 制御出力推移 */}
                  <div className="glass-panel rounded-2xl p-4 h-[200px] flex flex-col relative overflow-hidden border border-white/40">
                    <h3 className="text-[10px] font-black tracking-widest text-slate-400 uppercase mb-4">制御設定</h3>
                    <div className="flex-grow">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart 
                              data={simulatedData} 
                              margin={{ top: 0, right: 0, left: -25, bottom: 0 }} 
                              onClick={(e) => {
                                if (e && e.activeTooltipIndex !== undefined) {
                                  const point = simulatedData[e.activeTooltipIndex];
                                  if (point) { setPlaybackTime(point.rawTime); setIsPlaying(false); }
                                }
                              }}
                            >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey="timeLabel" hide />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#475569', fontWeight: 'bold' }} domain={[0, 10]} />
                                <Tooltip content={<CustomTooltip />} />
                                
                                <ReferenceLine x={currentlySelectedPoint?.timeLabel} stroke="#64748b" strokeWidth={4} strokeOpacity={0.15} />
                                <ReferenceLine x={currentlySelectedPoint?.timeLabel} stroke="#64748b" strokeWidth={1} strokeOpacity={0.8} />
                                
                                <Area type="step" dataKey="ventilationLevel" stroke="#10b981" strokeWidth={3} fill="rgba(16, 185, 129, 0.1)" dot={false} activeDot={<ActivePlaybackDot />} isAnimationActive={false} name="換気段階" />
                                <Area type="step" dataKey="heatingLevel" stroke="#f97316" strokeWidth={3} fill="rgba(249, 115, 22, 0.1)" dot={false} activeDot={<ActivePlaybackDot />} isAnimationActive={false} name="暖房段階" />
                                <Area type="step" dataKey="co2SupplyLevel" stroke="#a855f7" strokeWidth={3} fill="rgba(168, 85, 247, 0.1)" dot={false} activeDot={<ActivePlaybackDot />} isAnimationActive={false} name="CO2供給" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                  </div>
              </div>
            </main>
          </div>
        ) : (
          /* Primary Logs - Cinematic Glass */
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel rounded-[2rem] overflow-hidden flex-grow shadow-lg"
          >
            <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
               <div className="flex items-center gap-4">
                  <Activity className="text-emerald-500" size={24} />
                  <h3 className="text-sm font-black uppercase tracking-[0.3em] text-slate-900">システム計測データ・ストリーム</h3>
               </div>
               <div className="text-xs font-mono text-slate-400">解像度: 1分間隔 / 24時間フルスキャン</div>
            </div>
            <div className="overflow-auto max-h-[600px] custom-scrollbar bg-white">
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-black uppercase tracking-widest text-slate-400 bg-slate-50/50">
                    <th className="px-8 py-6">時刻</th>
                    <th className="px-8 py-6">ハウス内温度</th>
                    <th className="px-8 py-6">外気温度</th>
                    <th className="px-8 py-6">CO2濃度</th>
                    <th className="px-8 py-6">日射量</th>
                    <th className="px-8 py-6">換気窓状態</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {simulatedData.filter((_, i) => i % 60 === 0).map((d, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-8 py-5 font-black text-emerald-600">{d.timeLabel}</td>
                      <td className="px-8 py-5 text-slate-900 font-bold">{d.greenhouseTemp.toFixed(2)}°C</td>
                      <td className="px-8 py-5 text-slate-500">{d.temperature.toFixed(2)}°C</td>
                      <td className="px-8 py-5 text-purple-600 font-bold">{d.greenhouseCo2.toFixed(0)} PPM</td>
                      <td className="px-8 py-5 text-amber-600 font-bold">{d.solarRadiation.toFixed(2)} MJ</td>
                      <td className="px-8 py-5"><div className={`w-3 h-3 rounded-full ${d.ventilationLevel > 0 ? 'bg-emerald-500 shadow-sm' : 'bg-slate-200'}`} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        <footer className="flex flex-col md:flex-row justify-between items-center pt-4 mt-4 text-[9px] text-slate-400 font-mono tracking-widest gap-4 border-t border-slate-200">
            <div />
            <div className="text-[8px] font-black uppercase text-slate-300">
                &copy; 2024 Greenhouse Dynamics.
            </div>
        </footer>

      </div>
  );
}
