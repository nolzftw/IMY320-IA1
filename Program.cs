using System;
using System.Runtime.InteropServices.JavaScript;

namespace AudioVisualizerWasm
{
    public partial class Program
    {
        private static AudioVisualizer visualizer = new AudioVisualizer();

        public static void Main()
        {
            Console.WriteLine("Audio Visualizer WebAssembly module loaded");
        }

        [JSExport]
        public static void UpdateAudioData(string frequencyDataJson)
        {
            var frequencyData = System.Text.Json.JsonSerializer.Deserialize<float[]>(frequencyDataJson);
            if (frequencyData != null)
                visualizer.UpdateFrequencyData(frequencyData);
        }

        [JSExport]
        public static void UpdateParticles(double deltaTime, double mouseX, double mouseY, bool mousePressed)
        {
            visualizer.UpdateParticles(deltaTime, mouseX, mouseY, mousePressed);
        }

        [JSExport]
        public static int GetParticleCount() => visualizer.GetParticleCount();

        [JSExport]
        public static string GetParticleData()
        {
            return visualizer.GetParticleDataJson();
        }

        [JSExport]
        public static void SetVisualizationMode(int mode)
        {
            visualizer.SetVisualizationMode(mode);
        }

        [JSExport]
        public static void SetSensitivity(double sensitivity)
        {
            visualizer.SetSensitivity((float)sensitivity);
        }

        [JSExport]
        public static double GetTotalEnergy() => visualizer.GetTotalEnergy();

        [JSExport]
        public static double GetSpectralCentroid() => visualizer.GetSpectralCentroid();

        [JSExport]
        public static double GetLowFreqEnergy() => visualizer.GetLowFreqEnergy();

        [JSExport]
        public static double GetMidFreqEnergy() => visualizer.GetMidFreqEnergy();

        [JSExport]
        public static double GetHighFreqEnergy() => visualizer.GetHighFreqEnergy();
    }

    public class AudioVisualizer
    {
        private const int MAX_PARTICLES = 200; // Reduced for better performance
        private const int FREQUENCY_BANDS = 128;

        private Particle[] _particles;
        private float[] _frequencyData;
        private Random _random;

        private int _visualizationMode = 0;
        private float _sensitivity = 1.0f;
        private double _time = 0;

        public AudioVisualizer()
        {
            _particles = new Particle[MAX_PARTICLES];
            _frequencyData = new float[FREQUENCY_BANDS];
            _random = new Random();

            for (int i = 0; i < MAX_PARTICLES; i++)
            {
                _particles[i] = new Particle();
                ResetParticle(i);
            }
        }

        public void UpdateFrequencyData(float[] frequencyData)
        {
            int dataLength = Math.Min(frequencyData.Length, FREQUENCY_BANDS);
            Array.Copy(frequencyData, _frequencyData, dataLength);
        }

        public void UpdateParticles(double deltaTime, double mouseX, double mouseY, bool mousePressed)
        {
            _time += deltaTime;

            float totalEnergy = CalculateEnergyBand(0, FREQUENCY_BANDS);
            float lowFreqEnergy = CalculateEnergyBand(0, 32);
            float midFreqEnergy = CalculateEnergyBand(32, 96);
            float highFreqEnergy = CalculateEnergyBand(96, FREQUENCY_BANDS);

            float spectralCentroid = CalculateSpectralCentroid();

            for (int i = 0; i < MAX_PARTICLES; i++)
            {
                UpdateParticle(i, deltaTime, totalEnergy, lowFreqEnergy, midFreqEnergy, highFreqEnergy, spectralCentroid, mouseX, mouseY, mousePressed);
            }
        }

        private void UpdateParticle(int index, double deltaTime, float totalEnergy, float lowFreqEnergy, float midFreqEnergy, float highFreqEnergy, float spectralCentroid,
            double mouseX, double mouseY, bool mousePressed)
        {
            ref Particle particle = ref _particles[index];

            if (particle.Life <= 0)
            {
                ResetParticle(index);
                return;
            }

            switch (_visualizationMode)
            {
                case 0: 
                    UpdateEnhancedRadialMode(ref particle, deltaTime, totalEnergy, lowFreqEnergy, midFreqEnergy, highFreqEnergy, spectralCentroid);
                    break;
                case 1: 
                    UpdateDynamicOrbitalMode(ref particle, deltaTime, totalEnergy, lowFreqEnergy, midFreqEnergy, highFreqEnergy, spectralCentroid);
                    break;
                case 2: 
                    UpdateSpectralWaveMode(ref particle, deltaTime, totalEnergy, lowFreqEnergy, midFreqEnergy, highFreqEnergy, spectralCentroid);
                    break;
            }


            particle.X += particle.VelocityX * (float)deltaTime;
            particle.Y += particle.VelocityY * (float)deltaTime;
            particle.VelocityX *= 0.98f; 
            particle.VelocityY *= 0.98f;
            particle.Life -= (float)deltaTime;

            particle.ColorHue = (particle.ColorHue + totalEnergy * 2.0f + spectralCentroid * 1.5f) % 360.0f;
        }

        private void UpdateEnhancedRadialMode(ref Particle particle, double deltaTime, float totalEnergy, float lowFreqEnergy, float midFreqEnergy, float highFreqEnergy, float spectralCentroid)
        {
            float centerX = 400;
            float centerY = 300;
            float dx = particle.X - centerX;
            float dy = particle.Y - centerY;
            float distance = (float)Math.Sqrt(dx * dx + dy * dy);

            if (distance > 0)
            {
                float baseForce = totalEnergy * _sensitivity * 80.0f;
                float lowForce = lowFreqEnergy * _sensitivity * 60.0f;
                float spiralForce = midFreqEnergy * _sensitivity * 40.0f;

                particle.VelocityX += (dx / distance) * baseForce * (float)deltaTime;
                particle.VelocityY += (dy / distance) * baseForce * (float)deltaTime;

                float spiralAngle = (float)Math.Atan2(dy, dx) + spectralCentroid * 2.0f;
                particle.VelocityX += (float)Math.Cos(spiralAngle) * spiralForce * (float)deltaTime;
                particle.VelocityY += (float)Math.Sin(spiralAngle) * spiralForce * (float)deltaTime;

                float jitter = highFreqEnergy * _sensitivity * 20.0f;
                particle.VelocityX += ((float)_random.NextDouble() - 0.5f) * jitter * (float)deltaTime;
                particle.VelocityY += ((float)_random.NextDouble() - 0.5f) * jitter * (float)deltaTime;
            }
        }

        private void UpdateDynamicOrbitalMode(ref Particle particle, double deltaTime, float totalEnergy, float lowFreqEnergy, float midFreqEnergy, float highFreqEnergy, float spectralCentroid)
        {
            float centerX = 400;
            float centerY = 300;
            float dx = particle.X - centerX;
            float dy = particle.Y - centerY;
            float distance = (float)Math.Sqrt(dx * dx + dy * dy);

            if (distance > 0)
            {
                float orbitalSpeed = (midFreqEnergy + spectralCentroid) * _sensitivity * 40.0f;

                particle.VelocityX += -dy * orbitalSpeed * (float)deltaTime * 0.01f;
                particle.VelocityY += dx * orbitalSpeed * (float)deltaTime * 0.01f;

                float radialPulse = (lowFreqEnergy - 0.3f) * _sensitivity * 30.0f;
                particle.VelocityX += (dx / distance) * radialPulse * (float)deltaTime;
                particle.VelocityY += (dy / distance) * radialPulse * (float)deltaTime;

                float orbitVariation = highFreqEnergy * _sensitivity * 15.0f;
                float variationAngle = (float)(_time * 3.0f + particle.Life * 2.0f);
                particle.VelocityX += (float)Math.Cos(variationAngle) * orbitVariation * (float)deltaTime;
                particle.VelocityY += (float)Math.Sin(variationAngle) * orbitVariation * (float)deltaTime;
            }
        }

        private void UpdateSpectralWaveMode(ref Particle particle, double deltaTime, float totalEnergy, float lowFreqEnergy, float midFreqEnergy, float highFreqEnergy, float spectralCentroid)
        {
            float lowWaveAmplitude = lowFreqEnergy * _sensitivity * 80.0f;
            float midWaveAmplitude = midFreqEnergy * _sensitivity * 60.0f;
            float highWaveAmplitude = highFreqEnergy * _sensitivity * 40.0f;

            float lowWaveFreq = 0.01f + spectralCentroid * 0.02f;
            float midWaveFreq = 0.02f + spectralCentroid * 0.03f;
            float highWaveFreq = 0.03f + spectralCentroid * 0.04f;

            float waveForceX = (float)(
                Math.Sin(_time * lowWaveFreq + particle.Y * 0.005f) * lowWaveAmplitude +
                Math.Sin(_time * midWaveFreq + particle.Y * 0.01f) * midWaveAmplitude +
                Math.Sin(_time * highWaveFreq + particle.Y * 0.02f) * highWaveAmplitude
            );

            float waveForceY = (float)(
                Math.Cos(_time * lowWaveFreq + particle.X * 0.005f) * lowWaveAmplitude +
                Math.Cos(_time * midWaveFreq + particle.X * 0.01f) * midWaveAmplitude +
                Math.Cos(_time * highWaveFreq + particle.X * 0.02f) * highWaveAmplitude
            );

            particle.VelocityX += waveForceX * (float)deltaTime;
            particle.VelocityY += waveForceY * (float)deltaTime;

            float spiralForce = totalEnergy * _sensitivity * 30.0f;
            float spiralAngle = (float)_time * 2.0f + particle.Life;
            particle.VelocityX += (float)Math.Cos(spiralAngle) * spiralForce * (float)deltaTime;
            particle.VelocityY += (float)Math.Sin(spiralAngle) * spiralForce * (float)deltaTime;
        }

        private void ResetParticle(int index)
        {
            ref Particle particle = ref _particles[index];

            particle.X = 400 + (_random.NextSingle() - 0.5f) * 50;
            particle.Y = 300 + (_random.NextSingle() - 0.5f) * 50;

            float angle = _random.NextSingle() * 2 * (float)Math.PI;
            float speed = _random.NextSingle() * 20 + 10;

            particle.VelocityX = (float)Math.Cos(angle) * speed;
            particle.VelocityY = (float)Math.Sin(angle) * speed;
            particle.Life = _random.NextSingle() * 3 + 2;
            particle.ColorHue = _random.NextSingle() * 360;
        }

        private float CalculateEnergyBand(int startBand, int endBand)
        {
            float energy = 0;
            for (int i = startBand; i < endBand && i < FREQUENCY_BANDS; i++)
            {
                energy += _frequencyData[i];
            }
            return energy / (endBand - startBand);
        }

        private float CalculateSpectralCentroid()
        {
            float weightedSum = 0;
            float totalEnergy = 0;

            for (int i = 0; i < FREQUENCY_BANDS; i++)
            {
                weightedSum += i * _frequencyData[i];
                totalEnergy += _frequencyData[i];
            }

            return totalEnergy > 0 ? (weightedSum / totalEnergy) / FREQUENCY_BANDS : 0.5f;
        }

        public int GetParticleCount() => MAX_PARTICLES;

        public string GetParticleDataJson()
        {
            var particleData = new float[MAX_PARTICLES * 6];
            for (int i = 0; i < MAX_PARTICLES; i++)
            {
                int dataIndex = i * 6;
                particleData[dataIndex] = _particles[i].X;
                particleData[dataIndex + 1] = _particles[i].Y;
                particleData[dataIndex + 2] = _particles[i].VelocityX;
                particleData[dataIndex + 3] = _particles[i].VelocityY;
                particleData[dataIndex + 4] = _particles[i].Life;
                particleData[dataIndex + 5] = _particles[i].ColorHue;
            }
            return System.Text.Json.JsonSerializer.Serialize(particleData);
        }

        public void SetVisualizationMode(int mode) => _visualizationMode = mode;
        public void SetSensitivity(float sensitivity) => _sensitivity = Math.Max(0.1f, Math.Min(3.0f, sensitivity));
        public float GetTotalEnergy() => CalculateEnergyBand(0, FREQUENCY_BANDS);
        public float GetSpectralCentroid() => CalculateSpectralCentroid();
        public float GetLowFreqEnergy() => CalculateEnergyBand(0, 32);
        public float GetMidFreqEnergy() => CalculateEnergyBand(32, 96);
        public float GetHighFreqEnergy() => CalculateEnergyBand(96, FREQUENCY_BANDS);
    }

    public struct Particle
    {
        public float X;
        public float Y;
        public float VelocityX;
        public float VelocityY;
        public float Life;
        public float ColorHue;
    }
}