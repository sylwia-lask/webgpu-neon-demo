
# WebGPU Neon Demo

Interactive neon smoke / fluid-like simulation built with **WebGPU**, **WGSL**, and **React**.

This project explores real-time GPU compute techniques in the browser, combining a lightweight fluid-inspired simulation with a clean UI for live parameter control.

Live demo:  
👉 https://sylwia-lask.github.io/webgpu-neon-demo/

---

## ✨ Features

- WebGPU-based compute simulation (no external engines)
- Real-time interaction with mouse / pointer
- Adjustable parameters via control panel:
  - Trail persistence (fade)
  - Brush size
  - Color intensity
  - Swirl strength
  - Base hue
  - Hue animation speed
- Smooth ping-pong simulation using floating-point textures
- Modern React architecture with separated renderer, canvas, and controls

---

## 🎮 Controls

- **Move cursor over the canvas** to paint smoke
- Use the **right-side control panel** to tweak simulation parameters in real time
- Changes are applied instantly via uniform buffers (no shader recompilation)

---

## 🛠 Tech Stack

- **WebGPU**
- **WGSL** (compute + render shaders)
- **React + TypeScript**
- **Vite**
- **Tailwind CSS**

---

## 📱 Mobile Support

- Works on devices that support **WebGPU** and **Pointer Events**
- Desktop browsers (Chrome / Edge) are fully supported
- Mobile support depends on browser and OS version
- On unsupported devices, the simulation will not start

---

## 🚀 Development

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

---

## 🌍 Deployment

This project is configured for **GitHub Pages** using **GitHub Actions**.

After pushing to the `main` branch, the site is automatically built and deployed.

---

## 🧠 Notes

* The simulation is not a physically accurate fluid solver
* It is designed for visual experimentation and learning
* Parameters are intentionally exposed to encourage exploration

---

## 📸 Preview

Move your cursor and experiment with the controls to shape glowing, flowing smoke in real time.

---

## ❤️ Credits

Created as an experiment in GPU-driven visuals and interactive graphics on the web.

---

## 📄 License

MIT

