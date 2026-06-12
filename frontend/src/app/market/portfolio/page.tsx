import {redirect} from "next/navigation";

// The collector portfolio and LP portfolio were merged into a single unified
// Portfolio page at /portfolio (liquidity + collection + history + IL simulator).
export default function CollectorPortfolioRedirect() {
  redirect("/portfolio");
}
