build-ami:
	cd ami && ./build.sh

cdk-bootstrap:
	cdk bootstrap

build: build-ami cdk-bootstrap
	npm run build

clean:
	mkdir -p .trash
	rm mv ckd.out .trash

deploy:
	PERMITTED_IP=YOUR_IP AWS_PROFILE=inflion-prod cdk deploy '*'
