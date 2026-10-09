using System;
using System.Collections;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Reflection;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.OpenApi.Models;
using Swashbuckle.AspNetCore.SwaggerGen;

namespace Perfiumes.Api.Swagger
{
    // OperationFilter to properly document multipart/form-data requests that include IFormFile
    // Supports both direct IFormFile parameters and IFormFile properties inside DTOs bound from form.
    public class FormFileOperationFilter : IOperationFilter
    {
        public void Apply(OpenApiOperation operation, OperationFilterContext context)
        {
            var methodParams = context.MethodInfo.GetParameters();

            // Collect form fields discovered either as direct parameters or as properties on complex types
            var formFields = new Dictionary<string, OpenApiSchema>(StringComparer.OrdinalIgnoreCase);
            var required = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var p in methodParams)
            {
                var fromForm = p.GetCustomAttribute<FromFormAttribute>() != null;

                if (IsFileType(p.ParameterType))
                {
                    // direct file parameter
                    var name = p.Name ?? "file";
                    formFields[name] = new OpenApiSchema { Type = "string", Format = "binary" };
                    if (!IsOptionalParameter(p)) required.Add(name);
                    continue;
                }

                // If parameter is marked [FromForm] and is a complex type, scan its properties
                if (fromForm && IsComplexType(p.ParameterType))
                {
                    InspectTypeProperties(p.ParameterType, formFields, required);
                    continue;
                }

                // Also handle cases where complex types are not marked but contain IFormFile properties
                if (IsComplexType(p.ParameterType))
                {
                    // Only inspect if any property is a file type; avoid false positives
                    if (TypeHasFileProperty(p.ParameterType))
                    {
                        InspectTypeProperties(p.ParameterType, formFields, required);
                    }
                }
            }

            if (!formFields.Any())
                return;

            var schema = new OpenApiSchema
            {
                Type = "object",
                Properties = formFields.ToDictionary(kv => kv.Key, kv => kv.Value, StringComparer.OrdinalIgnoreCase)
            };

            if (required.Any())
                schema.Required = new HashSet<string>(required, StringComparer.OrdinalIgnoreCase);

            operation.RequestBody = new OpenApiRequestBody
            {
                Content = new Dictionary<string, OpenApiMediaType>
                {
                    ["multipart/form-data"] = new OpenApiMediaType { Schema = schema }
                }
            };

            // Remove any parameters that were moved into the request body from operation.Parameters
            if (operation.Parameters != null && operation.Parameters.Any())
            {
                operation.Parameters = operation.Parameters
                    .Where(p => !formFields.ContainsKey(p.Name))
                    .ToList();
            }
        }

        private static bool IsFileType(Type t)
        {
            if (t == null) return false;
            if (typeof(IFormFile).IsAssignableFrom(t)) return true;
            if (typeof(IFormFileCollection).IsAssignableFrom(t)) return true;
            if (typeof(IEnumerable<IFormFile>).IsAssignableFrom(t)) return true;
            if (t.IsGenericType)
            {
                var args = t.GetGenericArguments();
                return args.Any(a => typeof(IFormFile).IsAssignableFrom(a));
            }
            return false;
        }

        private static bool IsComplexType(Type t)
        {
            return t.IsClass && t != typeof(string) && !typeof(IEnumerable).IsAssignableFrom(t);
        }

        private static bool TypeHasFileProperty(Type t)
        {
            foreach (var prop in t.GetProperties(BindingFlags.Public | BindingFlags.Instance))
            {
                if (IsFileType(prop.PropertyType)) return true;
            }
            return false;
        }

        private static void InspectTypeProperties(Type t, Dictionary<string, OpenApiSchema> formFields, HashSet<string> required)
        {
            foreach (var prop in t.GetProperties(BindingFlags.Public | BindingFlags.Instance))
            {
                var name = prop.Name;
                if (IsFileType(prop.PropertyType))
                {
                    formFields[name] = new OpenApiSchema { Type = "string", Format = "binary" };
                }
                else
                {
                    // treat other form fields as strings
                    formFields[name] = new OpenApiSchema { Type = "string" };
                }

                // Mark required if [Required] attribute is present
                var isRequired = prop.GetCustomAttribute<RequiredAttribute>() != null;
                if (isRequired)
                    required.Add(name);
            }
        }

        private static bool IsOptionalParameter(ParameterInfo p)
        {
            if (p.HasDefaultValue) return true;
            var t = p.ParameterType;
            if (!t.IsValueType) return Nullable.GetUnderlyingType(t) != null || true; // reference types are optional by default in binding
            return Nullable.GetUnderlyingType(t) != null;
        }
    }
}
