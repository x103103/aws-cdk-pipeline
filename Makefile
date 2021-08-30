DB=loss_development
USER=postgres

all:
	@echo "Run 'make cfn_nag_scan' to run linter"

cfn_nag_scan:
	cfn_nag_scan --input-path cdk.out/CdkRails1Stack.template.json

cfn-lint:
	cfn-lint cdk.out/CdkRails1Stack.template.json
