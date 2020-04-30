include .env
export $(shell sed 's/=.*//' .env)

.ONESHELL:

deploy-ropsten:
	npm run deploy 2>&1| tee deploy.output
	CONTRACT_ADDRESS=$$(cat deploy.output | grep "contract address" | awk '{ print $$4 }' | tail -2 | head -1)
	ETHERSCAN_URL=https://ropsten.etherscan.io/address/$$CONTRACT_ADDRESS
	echo "Check out deployed contract at $$ETHERSCAN_URL"
	curl -0 -X POST https://api.github.com/repos/$$TRAVIS_REPO_SLUG/deployments \
		-H "Accept: application/vnd.github.ant-man-preview+json" \
		-H "Authorization: token $$GH_TOKEN" \
		-d "{ \"ref\": \"master\", \"environment\": \"ropsten\", \"required_contexts\": [] }" \
		2>&1| tee deployment.output
	STATUSES_URL="$$(cat deployment.output | grep statuses_url | awk -F\" '{ print $$4 }')"
	curl -0 -X POST $$STATUSES_URL \
		-H "Accept: application/vnd.github.ant-man-preview+json" \
		-H "Authorization: token $$GH_TOKEN" \
		-d "{ \"state\": \"success\", \"environment\": \"ropsten\", \"environment_url\": \"$$ETHERSCAN_URL\" }"
