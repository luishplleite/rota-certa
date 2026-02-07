-- Script para criar uma rota de exemplo com 61 paradas em Santos/SP
-- Usuário: luishplleite@gmail.com (ba282d0c-148e-4c5e-a364-9234ae542ca0)
-- Account: 522c3a90-eaa1-42a8-8503-049bc5bf3522

DO $$
DECLARE
    v_user_id UUID := 'ba282d0c-148e-4c5e-a364-9234ae542ca0';
    v_account_id UUID := '522c3a90-eaa1-42a8-8503-049bc5bf3522';
    v_itinerary_id UUID;
    v_today DATE := CURRENT_DATE;
BEGIN
    -- Criar novo itinerário
    INSERT INTO itineraries (id, user_id, account_id, date, name, status, created_at, updated_at)
    VALUES (
        gen_random_uuid(),
        v_user_id,
        v_account_id,
        v_today,
        'Rota Castelo/Rádio Clube - Santos',
        'active',
        NOW(),
        NOW()
    )
    RETURNING id INTO v_itinerary_id;

    -- Inserir paradas (coordenadas aproximadas da região Castelo/Rádio Clube em Santos)
    INSERT INTO stops (id, itinerary_id, account_id, fixed_identifier, address_full, latitude, longitude, status, sequence_order, package_count, created_at, updated_at) VALUES
    (gen_random_uuid(), v_itinerary_id, v_account_id, '1', 'R. Caminho da Divisa, 62, Jardim Castelo, Santos, SP, 11088-650', -23.9650, -46.3450, 'pending', 1, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '2', 'R. Dr. Flor Horácio Cyrillo, 10, Jardim Castelo, Santos, SP', -23.9655, -46.3455, 'pending', 2, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '3', 'Caminho da Capela, 89, Rádio Clube, Santos, SP, 11088-550', -23.9620, -46.3480, 'pending', 3, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '4', 'Rua Manoel Neves dos Santos, 156, Castelo, Santos, SP, 11087-290', -23.9580, -46.3420, 'pending', 4, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '5', 'Rua Manoel Neves dos Santos, 141, Castelo, Santos, SP, 11087-290', -23.9582, -46.3422, 'pending', 5, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '6', 'Rua Manoel Neves dos Santos, 100, Castelo, Santos, SP, 11087-290', -23.9584, -46.3424, 'pending', 6, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '7', 'Rua Doutor Aniz Tranjan, 635, Castelo, Santos, SP, 11088-060', -23.9600, -46.3440, 'pending', 7, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '8', 'Avenida Brigadeiro Faria Lima, 32, Rádio Clube, Santos, SP, 11088-300', -23.9610, -46.3500, 'pending', 8, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '9', 'Rua Doutor Aniz Tranjan, 585, Castelo, Santos, SP, 11088-060', -23.9602, -46.3442, 'pending', 9, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '10', 'Avenida Afonso Schmidt, 1128, Castelo, Santos, SP, 11087-000', -23.9560, -46.3400, 'pending', 10, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '11', 'R. Fausto Felício Bruzarosco, 160, Castelo, Santos, SP, 11087-400', -23.9570, -46.3410, 'pending', 11, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '12', 'Rua Arquiteto Romeu Esteves Martins Filho, 202, Castelo, Santos, SP, 11087-410', -23.9572, -46.3412, 'pending', 12, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '13', 'Rua Doutor Alexandre Alves Peixoto Filho, 76, Castelo, Santos, SP, 11087-390', -23.9574, -46.3414, 'pending', 13, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '14', 'Rua Doutor Alexandre Alves Peixoto Filho, 163, Castelo, Santos, SP, 11087-390', -23.9576, -46.3416, 'pending', 14, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '15', 'Rua Doutor Alexandre Alves Peixoto Filho, 171, Castelo, Santos, SP, 11087-390', -23.9578, -46.3418, 'pending', 15, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '16', 'Rua Armando de Almeida Alcântara, 131, Castelo, Santos, SP, 11087-380', -23.9550, -46.3390, 'pending', 16, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '17', 'Rua Armando de Almeida Alcântara, 116, Castelo, Santos, SP, 11087-380', -23.9552, -46.3392, 'pending', 17, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '18', 'Rua Waldemar Noschese, 87, Castelo, Santos, SP, 11087-340', -23.9554, -46.3394, 'pending', 18, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '19', 'Avenida Afonso Schmidt, 780, Castelo, Santos, SP, 11087-000', -23.9556, -46.3396, 'pending', 19, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '20', 'Rua Marechal Aguinaldo Caiado de Castro, 70, Castelo, Santos, SP, 11087-040', -23.9558, -46.3398, 'pending', 20, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '21', 'R. Prof. Dr. Edmundo Beniamin Tourinho, 23, Castelo, Santos, SP, 11087-090', -23.9540, -46.3380, 'pending', 21, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '22', 'Rua Professor Luís Gomes Cruz, 251, Castelo, Santos, SP, 11087-200', -23.9542, -46.3382, 'pending', 22, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '23', 'Rua Coronel Raul Humaitá Villa Nova, 76, Castelo, Santos, SP, 11087-140', -23.9544, -46.3384, 'pending', 23, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '24', 'Rua Coronel Raul Humaitá Villa Nova, 105, Castelo, Santos, SP, 11087-140', -23.9546, -46.3386, 'pending', 24, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '25', 'Rua Professor Lúcio Martins Rodrigues, 10, São Manoel, Santos, SP, 11087-130', -23.9548, -46.3388, 'pending', 25, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '26', 'Praça Prof. José Oliveira Lopes, 20, Rádio Clube, Santos, SP, 11088-290', -23.9630, -46.3510, 'pending', 26, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '27', 'Rua Ismael Coelho de Souza, 143, Castelo, Santos, SP, 11087-050', -23.9530, -46.3370, 'pending', 27, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '28', 'Rua Ismael Coelho de Souza, 60, Castelo, Santos, SP, 11087-050', -23.9532, -46.3372, 'pending', 28, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '29', 'Praça Marechal Eurico Gaspar Dutra, 68, Rádio Clube, Santos, SP, 11088-260', -23.9632, -46.3512, 'pending', 29, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '30', 'Praça Marechal Eurico Gaspar Dutra, 86, Rádio Clube, Santos, SP, 11088-200', -23.9634, -46.3514, 'pending', 30, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '31', 'R. Contra Alm. Esculápio Cezar Paiva, 101, Rádio Clube, Santos, SP, 11088-320', -23.9636, -46.3516, 'pending', 31, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '32', 'R. Mongaguá, 118, Rádio Clube, Santos, SP, 11088-310', -23.9638, -46.3518, 'pending', 32, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '33', 'R. Mongaguá, 47, Rádio Clube, Santos, SP, 11088-310', -23.9640, -46.3520, 'pending', 33, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '34', 'Rua José Alberto De Luca Pacheco, 1472, Rádio Clube, Santos, SP, 11088-170', -23.9642, -46.3522, 'pending', 34, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '35', 'Rua José Alberto de Luca, 826, Rádio Clube, Santos, SP, 11088-170', -23.9644, -46.3524, 'pending', 35, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '36', 'Rua Santa Rita de Cássia, 447, Rádio Clube, Santos, SP, 11088-200', -23.9646, -46.3526, 'pending', 36, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '37', 'Rua Santa Rita de Cássia, 422, Rádio Clube, Santos, SP, 11088-200', -23.9648, -46.3528, 'pending', 37, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '38', 'Rua José Casado Fernandes, 46, Rádio Clube, Santos, SP, 11088-280', -23.9660, -46.3540, 'pending', 38, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '39', 'Rua Sancho de Barros Pimentel Sobrinho, 82, Rádio Clube, Santos, SP, 11088-230', -23.9662, -46.3542, 'pending', 39, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '40', 'Rua Leonel Ferreira de Souza, 416, Rádio Clube, Santos, SP, 11088-210', -23.9664, -46.3544, 'pending', 40, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '41', 'Avenida Brigadeiro Faria Lima, 391, Rádio Clube, Santos, SP, 11088-300', -23.9666, -46.3546, 'pending', 41, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '42', 'Rua Governador Roberto Silveira, 534, Rádio Clube, Santos, SP, 11088-341', -23.9668, -46.3548, 'pending', 42, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '43', 'Rua do Caminho São José, 257, Rádio Clube, Santos, SP, 11088-500', -23.9670, -46.3550, 'pending', 43, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '44', 'Rua do Caminho São José, 820, Rádio Clube, Santos, SP, 11088-500', -23.9672, -46.3552, 'pending', 44, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '45', 'Caminho São Sebastião, 29, Rádio Clube, Santos, SP, 11088-450', -23.9674, -46.3554, 'pending', 45, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '46', 'Caminho São Sebastião, 104, Rádio Clube, Santos, SP, 11088-450', -23.9676, -46.3556, 'pending', 46, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '47', 'Caminho São Sebastião, 93, V. N. São Vicente, Santos, SP', -23.9678, -46.3558, 'pending', 47, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '48', 'Caminho São Sebastião, 101, V. N. São Vicente, Santos, SP', -23.9680, -46.3560, 'pending', 48, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '49', 'Av. Brg. Faria Lima, 1460, Rádio Clube, Santos, SP, 11088-300', -23.9682, -46.3562, 'pending', 49, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '50', 'Avenida Brigadeiro Faria Lima, 1468, Rádio Clube, Santos, SP, 11088-300', -23.9684, -46.3564, 'pending', 50, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '51', 'Rua Professor Nelson Espíndola Lobato, 14, Rádio Clube, Santos, SP, 11088-330', -23.9686, -46.3566, 'pending', 51, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '52', 'Rua Professor Nelson Espíndola Lobato, 270, Zona Noroeste, Santos, SP, 11010-010', -23.9688, -46.3568, 'pending', 52, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '53', 'R. Prof. Nelson Espíndola Lobato, 247, Rádio Clube, Santos, SP', -23.9690, -46.3570, 'pending', 53, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '54', 'Rua Professor Nelson Espíndola Lobato, 111, Rádio Clube, Santos, SP, 11088-330', -23.9692, -46.3572, 'pending', 54, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '55', 'Rua Leila Diniz, 12, Rádio Clube, Santos, SP, 11088-235', -23.9694, -46.3574, 'pending', 55, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '56', 'Rua Jardelino José da Silva, 65, V. N. São Vicente, Santos, SP, 11088-225', -23.9696, -46.3576, 'pending', 56, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '57', 'Rua Doutor Stefan Bryk, 177, Rádio Clube, Santos, SP, 11088-015', -23.9698, -46.3578, 'pending', 57, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '58', 'Caminho São Sebastião, 388, V. N. São Vicente, Santos, SP, 11088', -23.9700, -46.3580, 'pending', 58, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '59', 'Caminho São Sebastião, 328, Rádio Clube, Santos, SP, 11088-450', -23.9702, -46.3582, 'pending', 59, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '60', 'Travessa Vila Telma, 43, Rádio Clube, Santos, SP, 11088-001', -23.9704, -46.3584, 'pending', 60, 1, NOW(), NOW()),
    (gen_random_uuid(), v_itinerary_id, v_account_id, '61', 'Travessa Vila Telma, 7, Rádio Clube, Santos, SP, 11088-015', -23.9706, -46.3586, 'pending', 61, 1, NOW(), NOW());

    RAISE NOTICE 'Rota criada com sucesso! ID: %, Total de paradas: 61', v_itinerary_id;
END $$;

-- Verificar o resultado
SELECT 
    i.id as itinerary_id,
    i.date,
    i.name,
    i.status,
    COUNT(s.id) as total_stops
FROM itineraries i
LEFT JOIN stops s ON s.itinerary_id = i.id
WHERE i.user_id = 'ba282d0c-148e-4c5e-a364-9234ae542ca0'
  AND i.date = CURRENT_DATE
GROUP BY i.id, i.date, i.name, i.status;
