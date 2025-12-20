FROM httpd:alpine

COPY pipeline-manager/ /usr/local/apache2/htdocs/pipeline-manager/
COPY index.html /usr/local/apache2/htdocs/
COPY gantt-specification.json /usr/local/apache2/htdocs/
COPY gantt_generator.js /usr/local/apache2/htdocs/
COPY mermaid.min.js /usr/local/apache2/htdocs/

EXPOSE 80

ENTRYPOINT ["httpd-foreground"]
