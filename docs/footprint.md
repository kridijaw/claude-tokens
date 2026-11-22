# Footprint

How the claude-tokens report turns API-equivalent cost into energy, CO2, water and six other physical quantities.

## Method

The report computes the API-equivalent cost in USD of the tokens in the ledger. Cost times Wh per USD gives the electricity used for inference, and every other metric is a fixed multiple of that energy or of the CO2 derived from it. The footprint covers inference electricity only. CO2 is location-based on the US average grid. Water is on-site cooling plus the water consumed generating the electricity.

Energy per API-equivalent USD, in Wh, at the facility meter (PUE included). Three scenarios give a low, mid and high estimate:

| Scenario | Wh per USD | Derivation |
|---|---|---|
| low | 60 | Epoch AI, 2025-02-07: GPT-4o query with 500 output tokens uses about 0.3 Wh. At $10 per million output tokens that is $0.005. |
| mid | 110 | Jegham et al., arXiv 2505.09598v6, Table 4: Claude 3.7 Sonnet long-form prompt (10,000 in, 1,500 out) uses 5.671 Wh. At $3 and $15 per million tokens that is $0.0525, so 108 Wh per USD, rounded. |
| high | 200 | Same table, short-form prompt (100 in, 300 out): 0.950 Wh for $0.0048, so 198 Wh per USD, rounded. |

Conversion factors. The keys are those of `FOOTPRINT` in `bin/claude-tokens`:

| Key | Value | Source |
|---|---|---|
| `co2_kg_per_kwh` | 0.35 | EPA eGRID2023 (Revision 2, 2025-06-12), US total output emission rate 770.884 lb CO2e per MWh. |
| `water_l_per_kwh` | 4.88 | LBNL-2001637 (Shehabi et al., 2024): on-site WUE 0.36 L/kWh plus indirect 4.52 L/kWh for 2023. |
| `co2_kg_per_tree_year` | 22 | European Commission: "A mature tree can absorb over 22 kg of CO2 per year on average." |
| `gha_per_t_co2` | 0.337 | National Footprint and Biocapacity Accounts, 2022 edition (data year 2018), Footprint Intensity of Carbon 0.33667 gha per t CO2 per year. |
| `sea_ice_m2_per_t_co2` | 3 | Notz and Stroeve, Science 354:747 (2016): 3 ± 0.3 m² of September sea ice per t CO2. |
| `co2_kg_per_km` | 0.1067 | EEA: average new car registered in Europe in 2024, 106.7 g CO2/km (type approval, all powertrains). |
| `brain_w` | 20 | Levy and Calvert, PNAS 118(18):e2008173118 (2021). |
| `ice_kj_per_kg` | 333.5 | Osborne, J. Res. NBS 23:643 (1939), latent heat of fusion of ice. |

Formulas:

- Energy: kWh = USD × Wh per USD / 1000
- CO2: kg = kWh × 0.35
- Water: L = kWh × 4.88
- Tree-years: kg CO2 / 22
- Global hectares: gha = t CO2 × 0.337
- Arctic sea ice: m² = t CO2 × 3
- Km driven: km = kg CO2 / 0.1067
- Human brain time: hours = kWh / 0.020
- Ice melted: kg = kWh × 3600 / 333.5

Worked example, $1,000 at the mid scenario:

| energy | co2 | water | trees | gha | seaice | km | brain | ice |
|---|---|---|---|---|---|---|---|---|
| 110 kWh | 38.5 kg | 536.8 L | 1.75 | 0.012975 gha | 0.1155 m² | 360.8 km | 5,500 h | 1,187.4 kg |

Low and high are the same values times 60/110 and 200/110.

## Sources

All read on 2026-11-22.

- Epoch AI, 2025-02-07, energy of a GPT-4o query
- Jegham et al., arXiv 2505.09598v6: https://arxiv.org/abs/2505.09598v6
- EPA eGRID2023, Revision 2: https://www.epa.gov/egrid/summary-data
- LBNL-2001637, Shehabi et al., 2024: https://escholarship.org/uc/item/32d6m0d1
- European Commission, 3 billion trees: https://environment.ec.europa.eu/3-billion-trees_en
- National Footprint and Biocapacity Accounts, 2022 edition: https://footprint.info.yorku.ca/files/2022/03/NFA-Guidebook_2022_final.pdf
- Notz and Stroeve, 2016, doi:10.1126/science.aag2345: https://doi.org/10.1126/science.aag2345
- EEA, average CO2 emissions from new cars: https://www.eea.europa.eu/en/newsroom/news/average-co2-emissions-from-new-cars-and-vans-significantly-decreased-in-2025
- Levy and Calvert, 2021, doi:10.1073/pnas.2008173118: https://doi.org/10.1073/pnas.2008173118
- Osborne, 1939, J. Res. NBS 23:643

## Context figures

These published figures cannot be turned into Wh per USD because their token counts are unpublished:

- Google, arXiv 2508.15734: 0.24 Wh per median Gemini text prompt. https://arxiv.org/abs/2508.15734
- Altman, 2025-06-10: 0.34 Wh per average ChatGPT query.
- Oviedo et al., Joule 2026, doi:10.1016/j.joule.2026.102430: median 0.31 Wh per query. https://doi.org/10.1016/j.joule.2026.102430

Anthropic has published no energy, water or carbon figure for Claude inference as of 2026-11-22.

## Limits

- One Wh per USD value is applied to every model and date, although list prices per token differ between model generations.
- The anchors are third-party estimates for 2025 models, modelled from API latency, not measured.
- Cache reads are about half of the ledger's cost and are weighted by their price, while no anchor contains cached prompts.
- Training and hardware manufacturing are excluded.
- The grid is the US average, because the serving region is unknown.
- On-site WUE is defined per kWh of IT load but applied to facility energy, which overstates total water by about 1%.
- The tree figure is a mature-tree average without a cited study.
- The global hectare factor is from the 2022 edition, because later editions publish no constants.
- The car figure is for new registrations including electric cars, so the average car on the road emits more and the km value is on the high side.
- The sea ice relation was observed for cumulative emissions from 1953 to 2015.
- Days without transcripts are not estimated.
