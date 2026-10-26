import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { InteractionSession } from "../types";
import { Sparkles, Calendar } from "lucide-react";

interface DurationChartProps {
  data: InteractionSession[];
  theme?: "indigo" | "rose";
}

export default function DurationChart({ data, theme = "indigo" }: DurationChartProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const svgElement = svgRef.current;
    if (!svgElement) return;

    // Clear previous SVG contents
    d3.select(svgElement).selectAll("*").remove();

    if (data.length === 0) return;

    // Set up dimensions
    const margin = { top: 15, right: 15, bottom: 25, left: 35 };
    const width = svgElement.clientWidth || 340;
    const height = 140;

    const svg = d3
      .select(svgElement)
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("width", "100%")
      .attr("height", height);

    // Setup scales
    const xScale = d3
      .scaleTime()
      .domain(d3.extent(data, (d) => d.timestamp) as [Date, Date])
      .range([margin.left, width - margin.right]);

    const yScale = d3
      .scaleLinear()
      .domain([0, Math.max(10, d3.max(data, (d) => d.durationSeconds) || 10) * 1.15])
      .range([height - margin.bottom, margin.top]);

    // Setup axes grid lines
    const yGrid = d3
      .axisLeft(yScale)
      .tickSize(-width + margin.left + margin.right)
      .ticks(4)
      .tickFormat(() => "");

    svg
      .append("g")
      .attr("class", "grid")
      .attr("transform", `translate(${margin.left},0)`)
      .call(yGrid)
      .call((g) => g.select(".domain").remove())
      .call((g) =>
        g.selectAll(".tick line")
          .attr("stroke", "rgba(51, 65, 85, 0.35)")
          .attr("stroke-dasharray", "2,2")
      );

    // Setup axes decorators
    const xAxis = d3
      .axisBottom(xScale)
      .ticks(Math.min(data.length, 5))
      .tickFormat((domainValue) => {
        const date = domainValue as Date;
        return d3.timeFormat("%H:%M:%S")(date);
      })
      .tickSize(0);

    const yAxis = d3
      .axisLeft(yScale)
      .ticks(4)
      .tickFormat((d) => `${d}s`)
      .tickSize(0);

    // Custom stylings for Axes
    svg
      .append("g")
      .attr("transform", `translate(0, ${height - margin.bottom})`)
      .call(xAxis)
      .call((g) => g.select(".domain").attr("stroke", "rgba(51, 65, 85, 0.5)"))
      .call((g) =>
        g.selectAll("text")
          .attr("fill", "#64748b")
          .style("font-size", "9px")
          .style("font-family", "monospace")
          .attr("dy", "8px")
      );

    svg
      .append("g")
      .attr("transform", `translate(${margin.left}, 0)`)
      .call(yAxis)
      .call((g) => g.select(".domain").remove())
      .call((g) =>
        g.selectAll("text")
          .attr("fill", "#64748b")
          .style("font-size", "9px")
          .style("font-family", "monospace")
          .attr("dx", "-4px")
      );

    // Area generator for underglow background
    const areaGenerator = d3
      .area<InteractionSession>()
      .x((d) => xScale(d.timestamp))
      .y0(yScale(0))
      .y1((d) => yScale(d.durationSeconds))
      .curve(d3.curveMonotoneX);

    // Line generator
    const lineGenerator = d3
      .line<InteractionSession>()
      .x((d) => xScale(d.timestamp))
      .y((d) => yScale(d.durationSeconds))
      .curve(d3.curveMonotoneX);

    // Define gradients for glowing background
    const defs = svg.append("defs");
    const glowGradient = defs
      .append("linearGradient")
      .attr("id", "glow-gradient")
      .attr("x1", "0%")
      .attr("y1", "0%")
      .attr("x2", "0%")
      .attr("y2", "100%");

    const primaryColorHex = theme === "rose" ? "#ec4899" : "#06b6d4";
    const primaryGlowColor = theme === "rose" ? "rgba(236, 72, 153, 0.3)" : "rgba(6, 182, 212, 0.3)";

    glowGradient
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", primaryGlowColor);

    glowGradient
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", "rgba(15, 23, 42, 0)");

    // Render underglow filled area
    svg
      .append("path")
      .datum(data)
      .attr("class", "area")
      .attr("d", areaGenerator)
      .attr("fill", "url(#glow-gradient)");

    // Draw glowing main path
    svg
      .append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", primaryColorHex)
      .attr("stroke-width", 2)
      .attr("d", lineGenerator)
      .style("filter", `drop-shadow(0px 0px 4px ${primaryGlowColor === "rgba(236, 72, 153, 0.3)" ? "rgba(236, 72, 153, 0.6)" : "rgba(6, 182, 212, 0.6)"})`);

    // Interactive circular markers
    svg
      .selectAll(".dot")
      .data(data)
      .enter()
      .append("circle")
      .attr("cx", (d) => xScale(d.timestamp))
      .attr("cy", (d) => yScale(d.durationSeconds))
      .attr("r", 3.5)
      .attr("fill", "#0f172a")
      .attr("stroke", primaryColorHex)
      .attr("stroke-width", 1.5)
      .style("filter", `drop-shadow(0px 0px 3px ${primaryGlowColor === "rgba(236, 72, 153, 0.3)" ? "rgba(236, 72, 153, 0.8)" : "rgba(6, 182, 212, 0.8)"})`)
      .append("title")
      .text((d) => `Duration: ${d.durationSeconds} seconds`);

  }, [data, theme]);

  return (
    <div className="w-full bg-slate-900/40 backdrop-blur-md border border-slate-800/80 rounded-2xl p-4 shadow-xl mt-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Calendar className={`w-4 h-4 ${theme === "rose" ? "text-pink-500" : "text-cyan-400"}`} />
          <h3 className="text-xs font-semibold tracking-wide text-slate-300 font-sans uppercase">
            Interaction Pulse (D3)
          </h3>
        </div>
        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${theme === "rose" ? "bg-pink-950/20 border-pink-900/30" : "bg-cyan-950/20 border-cyan-900/30"}`}>
          <span className="relative flex h-1.5 w-1.5">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${theme === "rose" ? "bg-pink-400" : "bg-cyan-400"}`}></span>
            <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${theme === "rose" ? "bg-pink-500" : "bg-cyan-500"}`}></span>
          </span>
          <span className={`text-[9px] font-mono uppercase ${theme === "rose" ? "text-pink-400" : "text-cyan-400"}`}>Live durations</span>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-center text-slate-500 font-mono text-[11px]">
          <span>No historical pulse data recorded yet.</span>
          <span className="text-[10px] text-slate-600 mt-1">Start a chat session to track durations.</span>
        </div>
      ) : (
        <div className="w-full">
          <svg ref={svgRef} className="w-full overflow-visible" />
        </div>
      )}
    </div>
  );
}
