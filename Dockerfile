FROM nikolaik/python-nodejs:python3.14-nodejs22-alpine AS builder

RUN apk add --no-cache git

RUN git clone https://github.com/antmicro/kenning-pipeline-manager.git --depth 1 /pipeline-manager

WORKDIR /pipeline-manager

RUN pip install .
RUN ./build static-html

FROM httpd:alpine

COPY --from=builder /pipeline-manager/pipeline_manager/frontend/dist /usr/local/apache2/htdocs/pipeline-manager
COPY index.html /usr/local/apache2/htdocs/
COPY gantt-specification.json /usr/local/apache2/htdocs/
COPY gant_generator.js /usr/local/apache2/htdocs/
COPY mermaid.min.js /usr/local/apache2/htdocs/

EXPOSE 80

CMD ["httpd-foreground"]
