import {redirect} from "next/navigation";

// Trade history is now part of the unified Portfolio page at /portfolio.
export default function TradeHistoryRedirect() {
  redirect("/portfolio");
}
