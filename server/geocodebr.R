#!/usr/bin/env Rscript

args <- commandArgs(trailingOnly = TRUE)

if (length(args) < 1) {
  cat('{"error": "No address provided"}')
  quit(status = 1)
}

address <- args[1]

tryCatch({
  if (!require("geocodebr", quietly = TRUE)) {
    install.packages("geocodebr", repos = "https://cran.r-project.org", quiet = TRUE)
  }
  library(geocodebr, quietly = TRUE)
  
  parse_brazilian_address <- function(addr) {
    parts <- strsplit(addr, ",")[[1]]
    parts <- trimws(parts)
    
    street <- ""
    number <- ""
    neighborhood <- ""
    city <- ""
    state <- ""
    cep <- ""
    
    if (length(parts) >= 1) {
      first <- parts[1]
      match <- regmatches(first, regexec("^(.+?)\\s+(\\d{1,5}[A-Za-z]?)$", first))[[1]]
      if (length(match) == 3) {
        street <- match[2]
        number <- match[3]
      } else {
        street <- first
      }
    }
    
    if (length(parts) >= 2 && grepl("^\\d{1,5}[A-Za-z]?$", parts[2])) {
      number <- parts[2]
    }
    
    for (part in parts) {
      cep_match <- regmatches(part, regexec("(\\d{5}-?\\d{3})", part))[[1]]
      if (length(cep_match) > 0) {
        cep <- gsub("-", "", cep_match[1])
        break
      }
    }
    
    known_cities <- c("Santos", "São Paulo", "Guarujá", "Cubatão", "Praia Grande", "São Vicente")
    for (i in seq_along(parts)) {
      part <- parts[i]
      for (city_name in known_cities) {
        if (grepl(city_name, part, ignore.case = TRUE)) {
          city <- city_name
          break
        }
      }
      if (city != "") break
    }
    
    for (part in parts) {
      if (grepl("^[A-Z]{2}$", trimws(part), ignore.case = TRUE)) {
        state <- toupper(trimws(part))
        break
      }
    }
    
    if (length(parts) >= 3 && neighborhood == "") {
      neighborhood <- parts[2]
      if (grepl("^\\d", neighborhood)) neighborhood <- ""
    }
    
    list(
      logradouro = street,
      numero = number,
      bairro = neighborhood,
      municipio = if (city != "") city else "Santos",
      estado = if (state != "") state else "SP",
      cep = cep
    )
  }
  
  parsed <- parse_brazilian_address(address)
  
  df <- data.frame(
    logradouro = parsed$logradouro,
    numero = parsed$numero,
    bairro = parsed$bairro,
    municipio = parsed$municipio,
    estado = parsed$estado,
    cep = parsed$cep,
    stringsAsFactors = FALSE
  )
  
  campos <- definir_campos(
    logradouro = "logradouro",
    numero = "numero",
    localidade = "bairro",
    municipio = "municipio",
    estado = "estado",
    cep = "cep"
  )
  
  resultado <- geocode(
    enderecos = df,
    campos_endereco = campos,
    resultado_completo = TRUE,
    verboso = FALSE,
    cache = TRUE
  )
  
  if (nrow(resultado) > 0 && !is.na(resultado$lat[1])) {
    result <- list(
      lat = resultado$lat[1],
      lon = resultado$lon[1],
      precisao = as.character(resultado$precisao[1]),
      desvio_metros = if (!is.null(resultado$desvio_metros)) resultado$desvio_metros[1] else NA,
      endereco_encontrado = if (!is.null(resultado$endereco_encontrado)) as.character(resultado$endereco_encontrado[1]) else "",
      display_name = paste(
        parsed$logradouro, 
        parsed$numero, 
        parsed$bairro, 
        parsed$municipio, 
        parsed$estado, 
        sep = ", "
      )
    )
    cat(jsonlite::toJSON(result, auto_unbox = TRUE))
  } else {
    cat('{"error": "Address not found", "lat": null, "lon": null}')
  }
  
}, error = function(e) {
  cat(paste0('{"error": "', gsub('"', '\\"', as.character(e$message)), '"}'))
  quit(status = 1)
})
