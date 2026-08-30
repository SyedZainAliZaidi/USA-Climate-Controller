# Demo Script

Environmental and Health Monitoring App

Total time target: about four minutes, plus questions.

## 1. Open with the problem, about 30 seconds

Outdoor workers do not usually get a clear, area specific warning about
heat risk before they start a shift. Weather apps give a city wide number,
not a street level picture. This project closes that gap using real heat
data for a specific area, translated into plain safety guidance.

## 2. Open the dashboard, about 30 seconds

Run `npm start`, open the dashboard in the browser. Point out the status
badge showing demo mode, and explain in one sentence why: the FortyGuard
data window for this key is fixed to 2026 08 26, so the demo runs on that
date on purpose rather than pretending to be live.

## 3. Walk the summary card, about 30 seconds

Read the headline out loud. It states the average temperature, the worst
risk level found across the area, and when it peaks. Point out that the
peak hour comes from real historical measurement, the time_of_measure
field, not a guess.

## 4. Walk the heat map, about 45 seconds

Point at the grid. Each cell is one 60 meter tile, colored by average
temperature. Explain the four risk bands quickly: low, moderate, high,
extreme, using the legend above the grid. Hover a few cells to show the
tooltip with the exact figure.

## 5. Walk the recommendations and the tile table, about 45 seconds

Show the safety recommendation list, and explain that the text changes
based on the worst risk level found, not a fixed message. Then filter the
tile table by typing "high" or "extreme" into the filter box, to show that
a supervisor could find exactly which parts of the area need attention
right now.

## 6. Usage panel, about 20 seconds

Point at the usage card. Mention the plan is a hackathon specific tier with
2,000,000 credits, and that a single heatmap call costs 4,220 credits, so
the project can run many demo and test cycles without running out.

## 7. Close with the roadmap, about 30 seconds

State clearly that this is the first working slice of a larger idea: a
system that keeps collecting weather and humidity data over time, learns
from it, and eventually predicts next day temperature instead of only
reporting what already happened. Mention the two things that would come
next: a real forecasting agent, and automated delivery of the alert to a
worker's phone.

## Fallback if something breaks live

Demo mode is on by default and reads from a local sample file, so a lost
network connection during the live demo does not stop the walkthrough. If
the server itself will not start, open `docs/projectDocumentation.md` and
walk through the architecture section and a screenshot instead.

## Likely questions and short answers

* Why is the data not live. The plan's data window ends 2026 08 26, about
  40 hours behind real time when it was checked, and the forecast endpoint
  returns no tiles at all. There is no live or forward data available
  through this key right now.
* Why Phoenix and not the original city. The original area of interest
  returned zero tiles on every check. Coverage through this key is US only,
  so the area of interest moved to downtown Phoenix, which is fully
  covered.
* How do you know an empty result is a real failure. That was the single
  most important thing the verification pass found: an empty result still
  returns a normal success response, so the client checks tile count
  directly instead of trusting the status field alone.
