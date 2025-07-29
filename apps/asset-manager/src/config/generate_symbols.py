import yfinance as yf
import pandas as pd
import json
import os

# hardcoded stock list (top 100 weighted S&P 500 companies) --- used in case of errors
HARDCODED_STOCK_LIST = [
    "NVDA", "MSFT", "AAPL", "AMZN", "META", "AVGO", "GOOGL", "GOOG", "TSLA", "BRK.B",
    "JPM", "WMT", "LLY", "V", "ORCL", "MA", "NFLX", "XOM", "COST", "JNJ",
    "HD", "PLTR", "PG", "BAC", "ABBV", "CVX", "KO", "GE", "AMD", "CSCO",
    "TMUS", "WFC", "CRM", "UNH", "IBM", "PM", "MS", "INTU", "GS", "LIN",
    "ABT", "DIS", "AXP", "MCD", "MRK", "RTX", "NOW", "CAT", "T", "PEP",
    "UBER", "BKNG", "TMO", "VZ", "BA", "SCHW", "ISRG", "QCOM", "C", "GEV",
    "BLK", "TXN", "ACN", "SPGI", "AMGN", "ADBE", "BSX", "ETN", "SYK", "AMAT",
    "ANET", "NEE", "DHR", "HON", "GILD", "PGR", "TJX", "BX", "PFE", "DE",
    "PANW", "COF", "KKR", "UNP", "APH", "LOW", "LRCX", "CMCSA", "ADP", "MU",
    "KLAC", "COP", "VRTX", "MDT", "CRWD", "NKE", "ADI", "SNPS", "SBUX", "CB"
]

def generate_symbols():
    commodities_set = { "XAU/USD" }
    crypto_set = { 
        "BTC/USD", "ETH/USD", "XRP/USD", "USDT/USD", "BNB/USD",
        "SOL/USD", "USDC/USD", "DOGE/USD", "TRX/USD", "ADA/USD",
        "HYPE/USDT", "SUI/USD", "XLM/USD", "LINK/USD", "HBAR/USD",
        "BCH/USD", "AVAX/USD", "LTC/USD", "SHIB/USD", "LEOu/USD",
        "TON/USD", "USDe/USD", "UNI/USD", "DOT/USD", "XMR/USD" 
    }
    indices_set = { "SPY", "QQQ", "IWM", "DIA" }

    try:
        # step 1: get S&P 500 tickers
        sp500_url = 'https://en.wikipedia.org/wiki/List_of_S%26P_500_companies'
        sp500_table = pd.read_html(sp500_url)
        tickers = sp500_table[0]['Symbol'].tolist()
        tickers = [ticker.replace('.', '-') for ticker in tickers]

        # step 2: download daily data
        data = yf.download(tickers, period="1d", interval="1d", group_by="ticker", threads=True, auto_adjust=True)
        print(f"[SYMBOLS] Fetched {len(tickers)} S&P 500 tickers")

        # step 3: extract volume
        volumes = {}
        for ticker in tickers:
            try:
                vol = data[ticker]["Volume"].values[0]
                volumes[ticker] = vol
            except Exception as e:
                print(f"[SYMBOLS] Skipping {ticker}: {e}")

        stock_list = list(volumes.keys())[:100]
        print("[SYMBOLS] Using dynamically fetched stock list")

    except Exception as e:
        print(f"[SYMBOLS] Error fetching dynamic stock list, falling back to hardcoded list: {e}")
        stock_list = HARDCODED_STOCK_LIST

    # final symbol structure
    categorized_symbols = {
        "stock": stock_list,
        "crypto": list(crypto_set),
        "index": list(indices_set),
        "commodity": list(commodities_set)
    }

    output_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../dist/config/symbols.json"))
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    print(f"[SYMBOLS] Writing symbols.json to {output_path}")
    with open(output_path, "w") as f:
        json.dump(categorized_symbols, f, indent=2)

    print("[SYMBOLS] symbols.json file generated successfully")

if __name__ == "__main__":
    generate_symbols()