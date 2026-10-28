# Q3销售报告撰写

> **You:** Write a short Q3 sales report for a fictional coffee chain called Northbean. Include: a one-paragraph summary, a markdown table of revenue by region (4 regions, with Q2, Q3 and growth %), the quarter-over-quarter growth formula in LaTeX, and a short Python snippet that computes growth. Keep it under 250 words.

## Northbean — Q3 2026 Sales Report

### Executive Summary

Northbean delivered strong sales performance in Q3 2026, generating **$5.4 million in revenue**, up **20%** from Q2's $4.5 million. Growth was driven by increased customer traffic, seasonal beverage promotions, and expanded digital ordering. The West region led in revenue, while the South achieved the highest percentage growth. All four regions recorded positive quarter-over-quarter performance, positioning Northbean for continued expansion in Q4.

### Revenue by Region

*All figures are fictional.*

| Region | Q2 Revenue | Q3 Revenue | Growth |
|---|---:|---:|---:|
| North | $1,200,000 | $1,380,000 | +15.0% |
| South | $900,000 | $1,170,000 | +30.0% |
| East | $1,100,000 | $1,320,000 | +20.0% |
| West | $1,300,000 | $1,530,000 | +17.7% |
| **Total** | **$4,500,000** | **$5,400,000** | **+20.0%** |

### Growth Formula

Quarter-over-quarter (QoQ) revenue growth:

\[
\text{Growth (\%)}=\frac{\text{Q3 Revenue}-\text{Q2 Revenue}}{\text{Q2 Revenue}}\times100
\]

### Python Example

```python
q2 = 4_500_000
q3 = 5_400_000

growth = (q3 - q2) / q2 * 100

print(f"QoQ Growth: {growth:.1f}%")
# Output: QoQ Growth: 20.0%
```

### Q4 Outlook

Northbean should prioritize high-growth Southern markets, strengthen loyalty programs, and capitalize on holiday beverage demand to sustain momentum.

---

> **You:** Add a second section: a markdown table of the top 5 drinks by units sold in Q3, with columns Drink, Units, Avg price.

### Q3 Top 5 Best-Selling Drinks

The following table highlights Northbean's five best-selling drinks by units sold during Q3 2026.

| Drink | Units | Avg price |
|---|---:|---:|
| Iced Latte | 185,000 | $5.50 |
| Cold Brew | 162,000 | $4.75 |
| Cappuccino | 148,000 | $4.95 |
| Caramel Macchiato | 135,000 | $5.95 |
| Americano | 120,000 | $3.75 |
| **Total** | **750,000** | **$5.06** |

*Fictional sales data. The total average price is weighted by units sold.*

**Key Insight:** Iced Latte led sales with 185,000 units, while Caramel Macchiato commanded the highest average price at $5.95. Cold beverages accounted for 46.3% of the top five drinks' unit sales.

---

If you want, I can:

- Add a section analyzing top drink sales trends and regional preferences
- Create a profitability section showing profit margins for top drinks
- Include a summary of marketing campaigns impacting Q3 sales figures
