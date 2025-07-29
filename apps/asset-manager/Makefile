VENV_DIR=venv
PYTHON=$(VENV_DIR)/bin/python
PIP=$(VENV_DIR)/bin/pip

install:
	npm install

create_venv:
	# Create venv if it doesn't exist
	@if [ ! -d "$(VENV_DIR)" ]; then python3 -m venv $(VENV_DIR); fi

install_python_packages: create_venv
	$(PIP) install --upgrade pip
	$(PIP) install yfinance lxml pandas

run_build:
	npm run build
	cp src/config/generate_symbols.py dist/config/

start: install_python_packages run_build
	$(PYTHON) dist/config/generate_symbols.py
	npm start

test:
	npm test

clean:
	rm -rf node_modules dist package-lock.json $(VENV_DIR)

all: install start