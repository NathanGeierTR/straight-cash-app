import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

interface WeatherData {
  location: string;
  temperature: number;
  condition: string;
  humidity: number;
  windSpeed: number;
  icon: string;
  feelLike: number;
  uvIndex: number;
  visibility: number;
}

interface ForecastDay {
  day: string;
  high: number;
  low: number;
  condition: string;
  icon: string;
  precipitation: number;
}

@Component({
  selector: 'app-weather-widget',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './weather-widget.component.html',
  styleUrl: './weather-widget.component.scss'
})
export class WeatherWidgetComponent implements OnInit {
  currentWeather: WeatherData = {
    location: 'San Francisco, CA',
    temperature: 72,
    condition: 'Partly Cloudy',
    humidity: 65,
    windSpeed: 12,
    icon: '⛅',
    feelLike: 74,
    uvIndex: 6,
    visibility: 10
  };

  forecast: ForecastDay[] = [
    {
      day: 'Today',
      high: 72,
      low: 58,
      condition: 'Partly Cloudy',
      icon: '⛅',
      precipitation: 10
    },
    {
      day: 'Tue',
      high: 75,
      low: 61,
      condition: 'Sunny',
      icon: '☀️',
      precipitation: 5
    },
    {
      day: 'Wed',
      high: 69,
      low: 55,
      condition: 'Rainy',
      icon: '🌧️',
      precipitation: 85
    },
    {
      day: 'Thu',
      high: 71,
      low: 57,
      condition: 'Cloudy',
      icon: '☁️',
      precipitation: 20
    },
    {
      day: 'Fri',
      high: 73,
      low: 59,
      condition: 'Partly Cloudy',
      icon: '⛅',
      precipitation: 15
    }
  ];

  // Air quality data
  airQuality = {
    aqi: 42,
    status: 'Good',
    pm25: 12,
    pm10: 18,
    o3: 65,
    no2: 23
  };

  ngOnInit() {
    // In a real app, you would fetch weather data from an API
    this.updateWeatherData();
  }

  updateWeatherData() {
    // Simulate API call - in real app, call weather service
    // This could use services like OpenWeatherMap, WeatherAPI, etc.
    console.log('Weather data updated');
  }

  getTemperatureColor(temp: number): string {
    if (temp >= 80) return '#ef4444'; // Hot - Red
    if (temp >= 70) return '#f59e0b'; // Warm - Orange
    if (temp >= 60) return '#10b981'; // Mild - Green
    if (temp >= 50) return '#3b82f6'; // Cool - Blue
    return '#6366f1'; // Cold - Indigo
  }

  getAQIClass(aqi: number): string {
    if (aqi <= 50) return 'aqi-good';
    if (aqi <= 100) return 'aqi-moderate';
    if (aqi <= 150) return 'aqi-unhealthy-sensitive';
    if (aqi <= 200) return 'aqi-unhealthy';
    if (aqi <= 300) return 'aqi-very-unhealthy';
    return 'aqi-hazardous';
  }

  getAQIStatus(aqi: number): string {
    if (aqi <= 50) return 'Good';
    if (aqi <= 100) return 'Moderate';
    if (aqi <= 150) return 'Unhealthy for Sensitive Groups';
    if (aqi <= 200) return 'Unhealthy';
    if (aqi <= 300) return 'Very Unhealthy';
    return 'Hazardous';
  }

  getUVIndexClass(uv: number): string {
    if (uv <= 2) return 'uv-low';
    if (uv <= 5) return 'uv-moderate';
    if (uv <= 7) return 'uv-high';
    if (uv <= 10) return 'uv-very-high';
    return 'uv-extreme';
  }

  getUVIndexText(uv: number): string {
    if (uv <= 2) return 'Low';
    if (uv <= 5) return 'Moderate';
    if (uv <= 7) return 'High';
    if (uv <= 10) return 'Very High';
    return 'Extreme';
  }
}