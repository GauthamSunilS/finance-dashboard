"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Finance = {
  id: number;
  customer_name: string;
  income: number;
  expense: number;
};

export default function Home() {
  const [data, setData] = useState<Finance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const { data, error } = await supabase
      .from("finance_dashboard")
      .select("*");

    console.log("DATA:", data);
    console.log("ERROR:", error);

    if (error) {
      console.error(error);
    } else {
      setData(data || []);
    }

    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black p-8">
      <main className="max-w-4xl mx-auto bg-white dark:bg-zinc-900 rounded-xl shadow p-6">
        
        <h1 className="text-3xl font-semibold mb-6 text-black dark:text-white">
          Finance Dashboard
        </h1>

        {loading ? (
          <p className="text-zinc-500">Loading data...</p>
        ) : data.length === 0 ? (
          <p className="text-zinc-500">No data found.</p>
        ) : (
          <div className="grid gap-4">
            {data.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-700 flex justify-between"
              >
                <span className="font-medium text-black dark:text-white">
                  {item.customer_name}
                </span>

                <div className="text-right">
                  <div className="text-green-600 font-semibold">
                    +₹{item.income}
                  </div>
                  <div className="text-red-500 font-semibold">
                    -₹{item.expense}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}