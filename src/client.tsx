import "./styles.css";
import { createRoot } from "react-dom/client";
import App from "./app";
import { Providers } from "@/providers";

const root = createRoot(document.getElementById("app")!);

root.render(
  <Providers>
    <div className="min-h-screen bg-bg text-text font-sans text-base antialiased selection:bg-black selection:text-white">
      <App />
    </div>
  </Providers>
);
