# This makefile is intended to be included by each package's makefile.  The
# paths are relative to the package directory.

ROOT := $(CURDIR)/..
SOURCES := $(wildcard src/*)
VERSION := $(shell node -pe "require('./package.json').version")

export SHELL := /bin/bash
export PATH  := $(CURDIR)/node_modules/.bin:$(ROOT)/node_modules/.bin:$(PATH)

# The default target.
all: lint test build

# Used for pre-publishing.
dist: clean lint test build html

lint:
	@eslint --config $(ROOT)/eslint_src.json --max-warnings 0 src/
	@eslint --config $(ROOT)/eslint_test.json --max-warnings 0 test/
	@echo -e " $(OK) $@"

html:
ifneq (,$(wildcard ./.esdoc.json))
	@esdoc
	@echo -e " $(OK) $@ built"
endif

deps:
	@npm install
	@echo -e " $(OK) $@ installed"

depsclean:
	@rm -rf node_modules
	@echo -e " $(OK) $@"

CHANGELOG.md:
	@if [ -z "$(SINCE)" ]; \
	    then echo 'Specify last version with SINCE=x.y.z' && exit 1; \
	fi
	@git log $(PACKAGE)@$(SINCE) HEAD --pretty=format:'  - (%h) %s' $(CURDIR) \
	    | cat - <(echo -e "\n\n") CHANGELOG.md \
	    | sponge CHANGELOG.md
	@echo -e " $(OK) $@ updated; make sure to edit it"

.PHONY: test html CHANGELOG.md

OK := \033[32;01m✓\033[0m
