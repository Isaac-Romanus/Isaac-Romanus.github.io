# frozen_string_literal: true

desc "Validate disease front matter and recommended sections"
task :validate do
  ruby "scripts/validate_content.rb"
end

desc "Regenerate fields/*.md from _data/fields.yml"
task :generate_fields do
  ruby "scripts/generate_fields.rb"
end

desc "Build the site (jekyll build)"
task :build do
  sh "bundle exec jekyll build"
end

desc "Validate then build"
task default: %i[validate build]
