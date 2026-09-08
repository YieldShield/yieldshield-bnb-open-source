import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { SWRConfig } from "swr";
import App from "./App";
import { ChainProvider } from "./chain/provider";
import { ToastProvider } from "./components/Toast";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ChainProvider>
      <SWRConfig value={{ revalidateOnFocus: false, dedupingInterval: 2000, keepPreviousData: true }}>
        <ToastProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ToastProvider>
      </SWRConfig>
    </ChainProvider>
  </StrictMode>,
);
