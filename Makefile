# Root forwarder — all infra targets live in infra/Makefile.
# `make X` here is the same as `make -C infra X`.
.DEFAULT_GOAL := help
%:
	@$(MAKE) -C infra $@
