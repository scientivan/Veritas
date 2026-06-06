import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {Nav} from "@/components/Nav";
import {Footer} from "@/components/Footer";
import {CreatorProfile} from "@/components/CreatorProfile";
import {shortenAddress} from "@/lib/utils";

function isAddress(a: string): a is `0x${string}` {
  return a.startsWith("0x") && a.length === 42;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{address: string}>;
}): Promise<Metadata> {
  const {address} = await params;
  return {
    title: isAddress(address)
      ? `Creator ${shortenAddress(address, 6)} · Veritas Protocol`
      : "Creator · Veritas Protocol",
  };
}

export default async function CreatorProfilePage({
  params,
}: {
  params: Promise<{address: string}>;
}) {
  const {address} = await params;
  if (!isAddress(address)) notFound();

  return (
    <>
      <Nav />
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <CreatorProfile address={address} />
        </div>
      </main>
      <Footer />
    </>
  );
}
